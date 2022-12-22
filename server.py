#!/usr/bin/env python3

import io
import json
import os
import time
import imghdr
from pathlib import Path
from typing import Union
from parse_args import parse_args

import cv2
import torch
import numpy as np
from loguru import logger
from mat import MAT
from interactive_seg import InteractiveSeg, Click
from base import Config

from flask import Flask, request, send_file, cli, make_response

cli.show_server_banner = lambda *_: None
from flask_cors import CORS

from helper import (
    load_img,
    numpy_to_bytes,
    resize_max_size,
)

BUILD_DIR = os.environ.get("BUILD_DIR", "app/build")

app = Flask(__name__, static_folder=os.path.join(BUILD_DIR, "static"))
app.config["JSON_AS_ASCII"] = False
CORS(app, expose_headers=["Content-Disposition"])

interactive_seg_model: InteractiveSeg = None
device = None

def get_image_ext(img_bytes):
    w = imghdr.what("", img_bytes)
    if w is None:
        w = "jpeg"
    return w

@app.route("/inpaint", methods=["POST"])
def process():
    print(request.files)
    input = request.files
    # RGB
    origin_image_bytes = input["image"].read()

    image, alpha_channel = load_img(origin_image_bytes)
    mask, _ = load_img(input["mask"].read(), gray=True)
    mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)[1]
    
    if image.shape[:2] != mask.shape[:2]:
        return f"Mask shape{mask.shape[:2]} not queal to Image shape{image.shape[:2]}", 400

    original_shape = image.shape
    interpolation = cv2.INTER_CUBIC

    form = request.form
    size_limit: Union[int, str] = form.get("sizeLimit", "1080")
    if size_limit == "Original":
        size_limit = max(image.shape)
    else:
        size_limit = int(size_limit)

    config = Config(
        ldm_steps=25,
        hd_strategy='Crop',
        hd_strategy_crop_margin=128,
        hd_strategy_crop_trigger_size=512,
        hd_strategy_resize_limit=1024
    )

    logger.info(f"Origin image shape: {original_shape}")
    image = resize_max_size(image, size_limit=size_limit, interpolation=interpolation)
    logger.info(f"Resized image shape: {image.shape}")

    mask = resize_max_size(mask, size_limit=size_limit, interpolation=interpolation)

    start = time.time()
    try:
        res_np_img = model(image, mask, config)
    except RuntimeError as e:
        logger.exception(e)
        return "Internal Server Error", 500
    finally:
        logger.info(f"process time: {(time.time() - start) * 1000}ms")

    if alpha_channel is not None:
        if alpha_channel.shape[:2] != res_np_img.shape[:2]:
            alpha_channel = cv2.resize(
                alpha_channel, dsize=(res_np_img.shape[1], res_np_img.shape[0])
            )
        res_np_img = np.concatenate(
            (res_np_img, alpha_channel[:, :, np.newaxis]), axis=-1
        )

    ext = get_image_ext(origin_image_bytes)

    response = make_response(
        send_file(
            io.BytesIO(numpy_to_bytes(res_np_img, ext)),
            mimetype=f"image/{ext}",
        )
    )
    response.headers["X-Seed"] = str(config.sd_seed)
    return response


@app.route("/interactive_seg", methods=["POST"])
def interactive_seg():
    input = request.files
    origin_image_bytes = input["image"].read()  # RGB
    image, _ = load_img(origin_image_bytes)
    if 'mask' in input:
        mask, _ = load_img(input["mask"].read(), gray=True)
    else:
        mask = None

    _clicks = json.loads(request.form["clicks"])
    clicks = []
    for i, click in enumerate(_clicks):
        clicks.append(Click(coords=(click[1], click[0]), indx=i, is_positive=click[2] == 1))

    start = time.time()
    new_mask = interactive_seg_model(image, clicks=clicks, prev_mask=mask)
    logger.info(f"interactive seg process time: {(time.time() - start) * 1000}ms")
    response = make_response(
        send_file(
            io.BytesIO(numpy_to_bytes(new_mask, 'png')),
            mimetype=f"image/png",
        )
    )
    return response

@app.route("/")
def index():
    return send_file(os.path.join(BUILD_DIR, "index.html"))


def main(args):
    global model
    global interactive_seg_model
    global device
    device = torch.device(args.device)
    model = MAT(device)
    interactive_seg_model = InteractiveSeg()
    app.run(host=args.host, port=args.port, debug=args.debug)    
    
if __name__ == '__main__':
    args = parse_args()
    main(args)
