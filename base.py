import abc
from typing import Optional

import cv2
import torch
import numpy as np
from loguru import logger

from helper import boxes_from_mask, resize_max_size, pad_img_to_modulo
from pydantic import BaseModel

class Config(BaseModel):
    # Configs for ldm model
    ldm_steps: int = 25
    ldm_sampler: str = "plms"

    # Configs for zits model
    zits_wireframe: bool = True

    # Configs for High Resolution Strategy(different way to preprocess image)
    hd_strategy: str = "Crop" 
    hd_strategy_crop_margin: int
    # If the longer side of the image is larger than this value, use crop strategy
    hd_strategy_crop_trigger_size: int
    hd_strategy_resize_limit: int

    # Configs for Stable Diffusion 1.5
    prompt: str = ""
    negative_prompt: str = ""
    # Crop image to this size before doing sd inpainting
    # The value is always on the original image scale
    use_croper: bool = False
    croper_x: int = None
    croper_y: int = None
    croper_height: int = None
    croper_width: int = None

    # Blur the edge of mask area. The higher the number the smoother blend with the original image
    sd_mask_blur: int = 0
    # Ignore this value, it's useless for inpainting
    sd_strength: float = 0.75
    # The number of denoising steps. More denoising steps usually lead to a
    # higher quality image at the expense of slower inference.
    sd_steps: int = 50
    # Higher guidance scale encourages to generate images that are closely linked
    # to the text prompt, usually at the expense of lower image quality.
    sd_guidance_scale: float = 7.5
    sd_sampler: str = "ddim"
    # -1 mean random seed
    sd_seed: int = 42
    sd_match_histograms: bool = False
    cv2_flag: str = 'INPAINT_NS'
    cv2_radius: int = 4


class InpaintModel:
    min_size: Optional[int] = None
    pad_mod = 8
    pad_to_square = False

    def __init__(self, device, **kwargs):
        """

        Args:
            device:
        """
        self.device = device
        self.init_model(device, **kwargs)

    @abc.abstractmethod
    def init_model(self, device, **kwargs):
        ...

    @staticmethod
    @abc.abstractmethod
    def is_downloaded() -> bool:
        ...

    @abc.abstractmethod
    def forward(self, image, mask, config: Config):
        """Input images and output images have same size
        images: [H, W, C] RGB
        masks: [H, W, 1] 255 为 masks 区域
        return: BGR IMAGE
        """
        ...

    def _pad_forward(self, image, mask, config: Config):
        origin_height, origin_width = image.shape[:2]
        pad_image = pad_img_to_modulo(
            image, mod=self.pad_mod, square=self.pad_to_square, min_size=self.min_size
        )
        pad_mask = pad_img_to_modulo(
            mask, mod=self.pad_mod, square=self.pad_to_square, min_size=self.min_size
        )

        logger.info(f"final forward pad size: {pad_image.shape}")

        result = self.forward(pad_image, pad_mask, config)
        result = result[0:origin_height, 0:origin_width, :]

        result, image, mask = self.forward_post_process(result, image, mask, config)

        mask = mask[:, :, np.newaxis]
        result = result * (mask / 255) + image[:, :, ::-1] * (1 - (mask / 255))
        return result

    def forward_post_process(self, result, image, mask, config):
        return result, image, mask

    @torch.no_grad()
    def __call__(self, image, mask, config: Config):
        """
        images: [H, W, C] RGB, not normalized
        masks: [H, W]
        return: BGR IMAGE
        """
        inpaint_result = None
        logger.info(f"hd_strategy: {config.hd_strategy}")
        if max(image.shape) > config.hd_strategy_crop_trigger_size:
            logger.info(f"Run crop strategy")
            boxes = boxes_from_mask(mask)
            crop_result = []
            for box in boxes:
                crop_image, crop_box = self._run_box(image, mask, box, config)
                crop_result.append((crop_image, crop_box))

            inpaint_result = image[:, :, ::-1]
            for crop_image, crop_box in crop_result:
                x1, y1, x2, y2 = crop_box
                inpaint_result[y1:y2, x1:x2, :] = crop_image
        if inpaint_result is None:
            inpaint_result = self._pad_forward(image, mask, config)

        return inpaint_result

    def _crop_box(self, image, mask, box, config: Config):
        """

        Args:
            image: [H, W, C] RGB
            mask: [H, W, 1]
            box: [left,top,right,bottom]

        Returns:
            BGR IMAGE, (l, r, r, b)
        """
        box_h = box[3] - box[1]
        box_w = box[2] - box[0]
        cx = (box[0] + box[2]) // 2
        cy = (box[1] + box[3]) // 2
        img_h, img_w = image.shape[:2]

        w = box_w + config.hd_strategy_crop_margin * 2
        h = box_h + config.hd_strategy_crop_margin * 2

        _l = cx - w // 2
        _r = cx + w // 2
        _t = cy - h // 2
        _b = cy + h // 2

        l = max(_l, 0)
        r = min(_r, img_w)
        t = max(_t, 0)
        b = min(_b, img_h)

        if _l < 0:
            r += abs(_l)
        if _r > img_w:
            l -= _r - img_w
        if _t < 0:
            b += abs(_t)
        if _b > img_h:
            t -= _b - img_h

        l = max(l, 0)
        r = min(r, img_w)
        t = max(t, 0)
        b = min(b, img_h)

        crop_img = image[t:b, l:r, :]
        crop_mask = mask[t:b, l:r]

        logger.info(f"box size: ({box_h},{box_w}) crop size: {crop_img.shape}")

        return crop_img, crop_mask, [l, t, r, b]

    def _calculate_cdf(self, histogram):
        cdf = histogram.cumsum()
        normalized_cdf = cdf / float(cdf.max())
        return normalized_cdf

    def _calculate_lookup(self, source_cdf, reference_cdf):
        lookup_table = np.zeros(256)
        lookup_val = 0
        for source_index, source_val in enumerate(source_cdf):
            for reference_index, reference_val in enumerate(reference_cdf):
                if reference_val >= source_val:
                    lookup_val = reference_index
                    break
            lookup_table[source_index] = lookup_val
        return lookup_table

    def _match_histograms(self, source, reference, mask):
        transformed_channels = []
        for channel in range(source.shape[-1]):
            source_channel = source[:, :, channel]
            reference_channel = reference[:, :, channel]
            source_histogram, _ = np.histogram(source_channel[mask == 0], 256, [0, 256])
            reference_histogram, _ = np.histogram(reference_channel[mask == 0], 256, [0, 256])

            source_cdf = self._calculate_cdf(source_histogram)
            reference_cdf = self._calculate_cdf(reference_histogram)

            lookup = self._calculate_lookup(source_cdf, reference_cdf)

            transformed_channels.append(cv2.LUT(source_channel, lookup))

        result = cv2.merge(transformed_channels)
        result = cv2.convertScaleAbs(result)

        return result

    def _run_box(self, image, mask, box, config: Config):
        """

        Args:
            image: [H, W, C] RGB
            mask: [H, W, 1]
            box: [left,top,right,bottom]

        Returns:
            BGR IMAGE
        """
        crop_img, crop_mask, [l, t, r, b] = self._crop_box(image, mask, box, config)

        return self._pad_forward(crop_img, crop_mask, config), [l, t, r, b]
