import React, {
  SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  CursorArrowRaysIcon,
  EyeIcon,
  ArrowsPointingOutIcon,
  ArrowDownTrayIcon,
  HandRaisedIcon,
  PaintBrushIcon,
} from '@heroicons/react/24/outline'
import {
  ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'
import { useRecoilState, useRecoilValue } from 'recoil'
import { useWindowSize, useKey, useKeyPressEvent } from 'react-use'
import inpaint, { postInteractiveSeg } from '../../adapters/inpainting'
import Button from '../shared/Button'
import Slider from './Slider'
import {
  downloadImage,
  isMidClick,
  isRightClick,
  loadImage,
  srcToFile,
  useImage,
} from '../../utils'
import {
  croperState,
  fileState,
  interactiveSegClicksState,
  isInpaintingState,
  isInteractiveSegRunningState,
  isInteractiveSegState,
  negativePropmtState,
  propmtState,
  toastState,
} from '../../store/Atoms'
import Croper from '../Croper/Croper'
import emitter, { EVENT_PROMPT, EVENT_CUSTOM_MASK } from '../../event'
import FileSelect from '../FileSelect/FileSelect'
import InteractiveSeg from '../InteractiveSeg/InteractiveSeg'
import InteractiveSegConfirmActions from '../InteractiveSeg/ConfirmActions'
import InteractiveSegReplaceModal from '../InteractiveSeg/ReplaceModal'

const TOOLBAR_SIZE = 200
const MIN_BRUSH_SIZE = 10
const MAX_BRUSH_SIZE = 100
const BRUSH_COLOR = '#ffcc00bb'
let beforeSpace = false

interface Line {
  size?: number
  pts: { x: number; y: number }[]
}

type LineGroup = Array<Line>

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: LineGroup,
  color = BRUSH_COLOR
) {
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  lines.forEach(line => {
    if (!line?.pts.length || !line.size) {
      return
    }
    ctx.lineWidth = line.size
    ctx.beginPath()
    ctx.moveTo(line.pts[0].x, line.pts[0].y)
    line.pts.forEach(pt => ctx.lineTo(pt.x, pt.y))
    ctx.stroke()
  })
}

function mouseXY(ev: SyntheticEvent) {
  const mouseEvent = ev.nativeEvent as MouseEvent
  return { x: mouseEvent.offsetX, y: mouseEvent.offsetY }
}

function Editor() {
  const [file, setFile] = useRecoilState(fileState)
  const promptVal = useRecoilValue(propmtState)
  const negativePromptVal = useRecoilValue(negativePropmtState)
  const croperRect = useRecoilValue(croperState)
  const [toastVal, setToastState] = useRecoilState(toastState)
  const [isInpainting, setIsInpainting] = useRecoilState(isInpaintingState)
  const [isInteractiveSeg, setIsInteractiveSeg] = useRecoilState(
    isInteractiveSegState
  )
  const [isInteractiveSegRunning, setIsInteractiveSegRunning] = useRecoilState(
    isInteractiveSegRunningState
  )

  const [showInteractiveSegModal, setShowInteractiveSegModal] = useState(false)
  const [interactiveSegMask, setInteractiveSegMask] =
    useState<HTMLImageElement | null>(null)
  // only used while interactive segmentation is on
  const [tmpInteractiveSegMask, setTmpInteractiveSegMask] =
    useState<HTMLImageElement | null>(null)
  const [prevInteractiveSegMask, setPrevInteractiveSegMask] = useState<
    HTMLImageElement | null | undefined
  >(null)

  const [clicks, setClicks] = useRecoilState(interactiveSegClicksState)

  const [brushSize, setBrushSize] = useState(40)
  const [original, isOriginalLoaded] = useImage(file)
  const [renders, setRenders] = useState<HTMLImageElement[]>([])
  const [context, setContext] = useState<CanvasRenderingContext2D>()
  const [maskCanvas] = useState<HTMLCanvasElement>(() => {
    return document.createElement('canvas')
  })
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([])
  const [lastLineGroup, setLastLineGroup] = useState<LineGroup>([])
  const [curLineGroup, setCurLineGroup] = useState<LineGroup>([])
  const [{ x, y }, setCoords] = useState({ x: -1, y: -1 })
  const [showBrush, setShowBrush] = useState(false)
  const [showRefBrush, setShowRefBrush] = useState(false)
  const [isPanning, setIsPanning] = useState<boolean>(false)
  const [isChangingBrushSizeByMouse, setIsChangingBrushSizeByMouse] =
    useState<boolean>(false)
  const [changeBrushSizeByMouseInit, setChangeBrushSizeByMouseInit] = useState({
    x: -1,
    y: -1,
    brushSize: 20,
  })
  const [showOriginal, setShowOriginal] = useState(false)
  const [scale, setScale] = useState<number>(1)
  const [panned, setPanned] = useState<boolean>(false)
  const [minScale, setMinScale] = useState<number>(1.0)
  const [sizeLimit, setSizeLimit] = useState<number>(1080)
  const windowSize = useWindowSize()
  const windowCenterX = windowSize.width / 2
  const windowCenterY = windowSize.height / 2
  const viewportRef = useRef<ReactZoomPanPinchRef | undefined | null>()
  // Indicates that the image has been loaded and is centered on first load
  const [initialCentered, setInitialCentered] = useState(false)

  const [isDraging, setIsDraging] = useState(false)
  const [isMultiStrokeKeyPressed, setIsMultiStrokeKeyPressed] = useState(false)

  const [sliderPos, setSliderPos] = useState<number>(0)

  // redo 相关
  const [redoRenders, setRedoRenders] = useState<HTMLImageElement[]>([])
  const [redoCurLines, setRedoCurLines] = useState<Line[]>([])
  const [redoLineGroups, setRedoLineGroups] = useState<LineGroup[]>([])

  const draw = useCallback(
    (render: HTMLImageElement, lineGroup: LineGroup) => {
      if (!context) {
        return
      }
      context.clearRect(0, 0, context.canvas.width, context.canvas.height)
      context.drawImage(
        render,
        0,
        0,
        original.naturalWidth,
        original.naturalHeight
      )
      if (isInteractiveSeg && tmpInteractiveSegMask !== null) {
        context.drawImage(
          tmpInteractiveSegMask,
          0,
          0,
          original.naturalWidth,
          original.naturalHeight
        )
      }
      if (!isInteractiveSeg && interactiveSegMask !== null) {
        context.drawImage(
          interactiveSegMask,
          0,
          0,
          original.naturalWidth,
          original.naturalHeight
        )
      }
      drawLines(context, lineGroup)
    },
    [
      context,
      original,
      isInteractiveSeg,
      tmpInteractiveSegMask,
      interactiveSegMask,
    ]
  )

  const drawLinesOnMask = useCallback(
    (_lineGroups: LineGroup[], maskImage?: HTMLImageElement | null) => {
      if (!context?.canvas.width || !context?.canvas.height) {
        throw new Error('canvas has invalid size')
      }
      maskCanvas.width = context?.canvas.width
      maskCanvas.height = context?.canvas.height
      const ctx = maskCanvas.getContext('2d')
      if (!ctx) {
        throw new Error('could not retrieve mask canvas')
      }

      if (maskImage !== undefined && maskImage !== null) {
        // TODO: check whether draw yellow mask works on backend
        ctx.drawImage(
          maskImage,
          0,
          0,
          original.naturalWidth,
          original.naturalHeight
        )
      }

      _lineGroups.forEach(lineGroup => {
        drawLines(ctx, lineGroup, 'white')
      })
    },
    [context, maskCanvas]
  )

  const hadDrawSomething = useCallback(() => {
    return curLineGroup.length !== 0
  }, [curLineGroup])

  const drawOnCurrentRender = useCallback(
    (lineGroup: LineGroup) => {
      if (renders.length === 0) {
        draw(original, lineGroup)
      } else {
        draw(renders[renders.length - 1], lineGroup)
      }
    },
    [original, renders, draw]
  )

  const runInpainting = useCallback(
    async (
      useLastLineGroup?: boolean,
      customMask?: File,
      maskImage?: HTMLImageElement | null
    ) => {
      if (file === undefined) {
        return
      }
      const useCustomMask = customMask !== undefined && customMask !== null
      const useMaskImage = maskImage !== undefined && maskImage !== null
      // useLastLineGroup 的影响
      // 1. 使用上一次的 mask
      // 2. 结果替换当前 render
      console.log('runInpainting')
      console.log({
        useCustomMask,
        useMaskImage,
      })

      let maskLineGroup: LineGroup = []
      if (useLastLineGroup === true) {
        if (lastLineGroup.length === 0) {
          return
        }
        maskLineGroup = lastLineGroup
      } else if (!useCustomMask) {
        if (!hadDrawSomething() && !useMaskImage) {
          return
        }

        setLastLineGroup(curLineGroup)
        maskLineGroup = curLineGroup
      }

      const newLineGroups = [...lineGroups, maskLineGroup]

      setCurLineGroup([])
      setIsDraging(false)
      setIsInpainting(true)

      drawLinesOnMask([maskLineGroup], maskImage)
      let targetFile = file
      if (true) {
        if (useLastLineGroup === true) {
          // renders.length == 1 还是用原来的
          if (renders.length > 1) {
            const lastRender = renders[renders.length - 2]
            targetFile = await srcToFile(
              lastRender.currentSrc,
              file.name,
              file.type
            )
          }
        } else if (renders.length > 0) {
          console.info('gradually inpainting on last result')

          const lastRender = renders[renders.length - 1]
          targetFile = await srcToFile(
            lastRender.currentSrc,
            file.name,
            file.type
          )
        }
      }

      const sdSeed = 42

      console.log({ useCustomMask })
      try {
        setToastState({
          open: true,
          desc: '请稍等几秒,图片正在修复中',
          state: 'default',
          duration: 4000,
        })
        const res = await inpaint(
          targetFile,
          useCustomMask ? undefined : maskCanvas.toDataURL(),
          useCustomMask ? customMask : undefined
        )
        if (!res) {
          throw new Error('Something went wrong on server side.')
        }
        const { blob, seed } = res
        const newRender = new Image()
        await loadImage(newRender, blob)

        if (useLastLineGroup === true) {
          const prevRenders = renders.slice(0, -1)
          const newRenders = [...prevRenders, newRender]
          setRenders(newRenders)
        } else {
          const newRenders = [...renders, newRender]
          setRenders(newRenders)
        }

        draw(newRender, [])
        // Only append new LineGroup after inpainting success
        setLineGroups(newLineGroups)

        // clear redo stack
        resetRedoState()
        setToastState({
          open: true,
          desc: '已成功修复',
          state: 'default',
          duration: 4000,
        })
      } catch (e: any) {
        setToastState({
          open: true,
          desc: e.message ? e.message : e.toString(),
          state: 'error',
          duration: 4000,
        })
        drawOnCurrentRender([])
      }
      setIsInpainting(false)
      setPrevInteractiveSegMask(maskImage)
      setTmpInteractiveSegMask(null)
      setInteractiveSegMask(null)
    },
    [
      lineGroups,
      curLineGroup,
      maskCanvas,
      true,
      croperRect,
      sizeLimit,
      promptVal,
      negativePromptVal,
      drawOnCurrentRender,
      hadDrawSomething,
      drawLinesOnMask,
    ]
  )

  useEffect(() => {
    emitter.on(EVENT_PROMPT, () => {
      if (hadDrawSomething() || interactiveSegMask) {
        runInpainting(false, undefined, interactiveSegMask)
      } else if (lastLineGroup.length !== 0) {
        // 使用上一次手绘的 mask 生成
        runInpainting(true, undefined, prevInteractiveSegMask)
      } else if (prevInteractiveSegMask) {
        // 使用上一次 IS 的 mask 生成
        runInpainting(false, undefined, prevInteractiveSegMask)
      } else {
        setToastState({
          open: true,
          desc: 'Please draw mask on picture',
          state: 'error',
          duration: 1500,
        })
      }
    })

    return () => {
      emitter.off(EVENT_PROMPT)
    }
  }, [
    hadDrawSomething,
    runInpainting,
    promptVal,
    interactiveSegMask,
    prevInteractiveSegMask,
  ])

  useEffect(() => {
    emitter.on(EVENT_CUSTOM_MASK, (data: any) => {
      runInpainting(false, data.mask)
    })

    return () => {
      emitter.off(EVENT_CUSTOM_MASK)
    }
  }, [runInpainting])

  const hadRunInpainting = () => {
    return renders.length !== 0
  }

  const handleMultiStrokeKeyDown = () => {
    if (isInpainting) {
      return
    }
    setIsMultiStrokeKeyPressed(true)
  }

  const handleMultiStrokeKeyup = () => {
    if (!isMultiStrokeKeyPressed) {
      return
    }
    if (isInpainting) {
      return
    }

    setIsMultiStrokeKeyPressed(false)
  }

  const predicate = (event: KeyboardEvent) => {
    return event.key === 'Control' || event.key === 'Meta'
  }

  useKey(predicate, handleMultiStrokeKeyup, { event: 'keyup' }, [
    isInpainting,
    isMultiStrokeKeyPressed,
    hadDrawSomething,
  ])

  useKey(
    predicate,
    handleMultiStrokeKeyDown,
    {
      event: 'keydown',
    },
    [isInpainting]
  )

  // Draw once the original image is loaded
  useEffect(() => {
    if (!isOriginalLoaded) {
      return
    }

    const rW = windowSize.width / original.naturalWidth
    const rH = (windowSize.height - TOOLBAR_SIZE) / original.naturalHeight

    let s = 1.0
    if (rW < 1 || rH < 1) {
      s = Math.min(rW, rH)
    }
    setMinScale(s)
    setScale(s)

    if (context?.canvas) {
      context.canvas.width = original.naturalWidth
      context.canvas.height = original.naturalHeight
      drawOnCurrentRender([])
    }

    if (!initialCentered) {
      viewportRef.current?.centerView(s, 1)
      setInitialCentered(true)
      const imageSizeLimit = Math.max(original.width, original.height)
      setSizeLimit(imageSizeLimit)
    }
  }, [
    context?.canvas,
    viewportRef,
    original,
    isOriginalLoaded,
    windowSize,
    initialCentered,
    drawOnCurrentRender,
  ])

  // Zoom reset
  const resetZoom = useCallback(() => {
    if (!minScale || !original || !windowSize) {
      return
    }
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const offsetX = (windowSize.width - original.width * minScale) / 2
    const offsetY = (windowSize.height - original.height * minScale) / 2
    viewport.setTransform(offsetX, offsetY, minScale, 200, 'easeOutQuad')
    viewport.state.scale = minScale

    setScale(minScale)
    setPanned(false)
  }, [
    viewportRef,
    windowSize,
    original,
    original.width,
    windowSize.height,
    minScale,
  ])

  const resetRedoState = () => {
    setRedoCurLines([])
    setRedoLineGroups([])
    setRedoRenders([])
  }

  useEffect(() => {
    window.addEventListener('resize', () => {
      resetZoom()
    })
    return () => {
      window.removeEventListener('resize', () => {
        resetZoom()
      })
    }
  }, [windowSize, resetZoom])

  useEffect(() => {
    window.addEventListener('blur', () => {
      setIsChangingBrushSizeByMouse(false)
    })
    return () => {
      window.removeEventListener('blur', () => {
        setIsChangingBrushSizeByMouse(false)
      })
    }
  }, [])

  const onInteractiveCancel = useCallback(() => {
    setIsInteractiveSeg(false)
    setIsInteractiveSegRunning(false)
    setClicks([])
    setTmpInteractiveSegMask(null)
  }, [])

  const handleEscPressed = () => {
    if (isInpainting) {
      return
    }

    if (isInteractiveSeg) {
      onInteractiveCancel()
      return
    }

    if (isDraging || isMultiStrokeKeyPressed) {
      setIsDraging(false)
      setCurLineGroup([])
      drawOnCurrentRender([])
    } else {
      resetZoom()
    }
  }

  useKey(
    'Escape',
    handleEscPressed,
    {
      event: 'keydown',
    },
    [
      isDraging,
      isInpainting,
      isMultiStrokeKeyPressed,
      isInteractiveSeg,
      onInteractiveCancel,
      resetZoom,
      drawOnCurrentRender,
    ]
  )

  const onMouseMove = (ev: SyntheticEvent) => {
    const mouseEvent = ev.nativeEvent as MouseEvent
    setCoords({ x: mouseEvent.pageX, y: mouseEvent.pageY })
  }

  const onMouseDrag = (ev: SyntheticEvent) => {
    if (isChangingBrushSizeByMouse) {
      const initX = changeBrushSizeByMouseInit.x
      // move right: increase brush size
      const newSize = changeBrushSizeByMouseInit.brushSize + (x - initX)
      if (newSize <= MAX_BRUSH_SIZE && newSize >= MIN_BRUSH_SIZE) {
        setBrushSize(newSize)
      }
      return
    }
    if (isInteractiveSeg) {
      return
    }
    if (isPanning) {
      return
    }
    if (!isDraging) {
      return
    }
    if (curLineGroup.length === 0) {
      return
    }
    const lineGroup = [...curLineGroup]
    lineGroup[lineGroup.length - 1].pts.push(mouseXY(ev))
    setCurLineGroup(lineGroup)
    drawOnCurrentRender(lineGroup)
  }

  const runInteractiveSeg = async (newClicks: number[][]) => {
    if (!file) {
      return
    }

    setIsInteractiveSegRunning(true)

    let targetFile = file
    if (renders.length > 0) {
      const lastRender = renders[renders.length - 1]
      targetFile = await srcToFile(lastRender.currentSrc, file.name, file.type)
    }

    const prevMask = null
    // prev_mask seems to be not working better
    // if (tmpInteractiveSegMask !== null) {
    //   prevMask = await srcToFile(
    //     tmpInteractiveSegMask.currentSrc,
    //     'prev_mask.jpg',
    //     'image/jpeg'
    //   )
    // }

    try {
      setToastState({
        open: true,
        desc: '请您稍等',
        state: 'default',
        duration: 1500,
      })
      const res = await postInteractiveSeg(targetFile, prevMask, newClicks)
      if (!res) {
        throw new Error('Something went wrong on server side.')
      }
      const { blob } = res
      const img = new Image()
      img.onload = () => {
        setTmpInteractiveSegMask(img)
      }
      img.src = blob
    } catch (e: any) {
      setToastState({
        open: true,
        desc: e.message ? e.message : e.toString(),
        state: 'error',
        duration: 4000,
      })
    }
    setIsInteractiveSegRunning(false)
  }

  const onPointerUp = (ev: SyntheticEvent) => {
    if (isMidClick(ev)) {
      setIsPanning(false)
    }
    if (isInteractiveSeg) {
      return
    }

    if (isPanning) {
      return
    }
    if (!original.src) {
      return
    }
    const canvas = context?.canvas
    if (!canvas) {
      return
    }
    if (isInpainting) {
      return
    }
    if (!isDraging) {
      return
    }

    if (isMultiStrokeKeyPressed) {
      setIsDraging(false)
      return
    }

    runInpainting()
  }

  const isOutsideCroper = (clickPnt: { x: number; y: number }) => {
    if (clickPnt.x < croperRect.x) {
      return true
    }
    if (clickPnt.y < croperRect.y) {
      return true
    }
    if (clickPnt.x > croperRect.x + croperRect.width) {
      return true
    }
    if (clickPnt.y > croperRect.y + croperRect.height) {
      return true
    }
    return false
  }

  const onCanvasMouseUp = (ev: SyntheticEvent) => {
    console.log(beforeSpace)
    if (beforeSpace) {
      return
    }
    if (isInteractiveSeg) {
      const xy = mouseXY(ev)
      const newClicks: number[][] = [...clicks]
      if (isRightClick(ev)) {
        newClicks.push([xy.x, xy.y, 0, newClicks.length])
      } else {
        newClicks.push([xy.x, xy.y, 1, newClicks.length])
      }
      runInteractiveSeg(newClicks)
      setClicks(newClicks)
    }
  }

  const onMouseDown = (ev: any) => {
    if (isInteractiveSeg) {
      return
    }
    if (isChangingBrushSizeByMouse) {
      return
    }
    if (isPanning) {
      return
    }
    if (!original.src) {
      return
    }
    const canvas = context?.canvas
    if (!canvas) {
      return
    }
    if (isInpainting) {
      return
    }

    if (isRightClick(ev)) {
      return
    }

    if (isMidClick(ev)) {
      setIsPanning(true)
      return
    }

    if (false && isOutsideCroper(mouseXY(ev))) {
      return
    }

    setIsDraging(true)

    let lineGroup: LineGroup = []
    if (isMultiStrokeKeyPressed) {
      lineGroup = [...curLineGroup]
    }
    lineGroup.push({ size: brushSize, pts: [mouseXY(ev)] })
    setCurLineGroup(lineGroup)
    drawOnCurrentRender(lineGroup)
  }

  const undoStroke = useCallback(() => {
    if (curLineGroup.length === 0) {
      return
    }
    setLastLineGroup([])

    const lastLine = curLineGroup.pop()!
    const newRedoCurLines = [...redoCurLines, lastLine]
    setRedoCurLines(newRedoCurLines)

    const newLineGroup = [...curLineGroup]
    setCurLineGroup(newLineGroup)
    drawOnCurrentRender(newLineGroup)
  }, [curLineGroup, redoCurLines, drawOnCurrentRender])

  const undoRender = useCallback(() => {
    if (!renders.length) {
      return
    }

    // save line Group
    const latestLineGroup = lineGroups.pop()!
    setRedoLineGroups([...redoLineGroups, latestLineGroup])
    // If render is undo, clear strokes
    setRedoCurLines([])

    setLineGroups([...lineGroups])
    setCurLineGroup([])
    setIsDraging(false)

    // save render
    const lastRender = renders.pop()!
    setRedoRenders([...redoRenders, lastRender])

    const newRenders = [...renders]
    setRenders(newRenders)
    if (newRenders.length === 0) {
      draw(original, [])
    } else {
      draw(newRenders[newRenders.length - 1], [])
    }
  }, [draw, renders, redoRenders, redoLineGroups, lineGroups, original])

  const undo = () => {
    undoRender()
  }

  // Handle Cmd+Z
  const undoPredicate = (event: KeyboardEvent) => {
    // TODO: fix prompt input ctrl+z
    const isCmdZ =
      (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === 'z'
    // Handle tab switch
    if (event.key === 'Tab') {
      event.preventDefault()
    }
    if (isCmdZ) {
      event.preventDefault()
      console.log('undo')
      return true
    }
    return false
  }

  useKey(undoPredicate, undo, undefined, [undoStroke, undoRender])

  const disableUndo = () => {
    if (isInteractiveSeg) {
      return true
    }
    if (isInpainting) {
      return true
    }
    if (renders.length > 0) {
      return false
    }

    if (renders.length === 0) {
      return true
    }

    return false
  }

  const redoStroke = useCallback(() => {
    if (redoCurLines.length === 0) {
      return
    }
    const line = redoCurLines.pop()!
    setRedoCurLines([...redoCurLines])

    const newLineGroup = [...curLineGroup, line]
    setCurLineGroup(newLineGroup)
    drawOnCurrentRender(newLineGroup)
  }, [curLineGroup, redoCurLines, drawOnCurrentRender])

  const redoRender = useCallback(() => {
    if (redoRenders.length === 0) {
      return
    }
    const lineGroup = redoLineGroups.pop()!
    setRedoLineGroups([...redoLineGroups])

    setLineGroups([...lineGroups, lineGroup])
    setCurLineGroup([])
    setIsDraging(false)

    const render = redoRenders.pop()!
    const newRenders = [...renders, render]
    setRenders(newRenders)
    draw(newRenders[newRenders.length - 1], [])
  }, [draw, renders, redoRenders, redoLineGroups, lineGroups, original])

  const redo = () => {
    if (redoCurLines.length !== 0) {
      redoStroke()
    } else {
      redoRender()
    }
  }

  // Handle Cmd+shift+Z
  const redoPredicate = (event: KeyboardEvent) => {
    const isCmdZ =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'z'
    // Handle tab switch
    if (event.key === 'Tab') {
      event.preventDefault()
    }
    if (isCmdZ) {
      event.preventDefault()
      console.log('redo')
      return true
    }
    return false
  }

  useKey(redoPredicate, redo, undefined, [redoStroke, redoRender])

  const disableRedo = () => {
    if (isInteractiveSeg) {
      return true
    }
    if (isInpainting) {
      return true
    }
    if (redoRenders.length > 0) {
      return false
    }

    if (redoRenders.length === 0) {
      return true
    }

    return false
  }

  useKeyPressEvent(
    'Tab',
    ev => {
      ev?.preventDefault()
      ev?.stopPropagation()
      if (hadRunInpainting()) {
        setShowOriginal(() => {
          window.setTimeout(() => {
            setSliderPos(100)
          }, 10)
          return true
        })
      }
    },
    ev => {
      ev?.preventDefault()
      ev?.stopPropagation()
      if (hadRunInpainting()) {
        setSliderPos(0)
        window.setTimeout(() => {
          setShowOriginal(false)
        }, 350)
      }
    }
  )

  function download() {
    if (file === undefined) {
      return
    }
    const name = file.name.replace(/(\.[\w\d_-]+)$/i, '_inpaint$1')
    const curRender = renders[renders.length - 1]
    downloadImage(curRender.currentSrc, name)
  }

  const onSizeLimitChange = (_sizeLimit: number) => {
    setSizeLimit(_sizeLimit)
  }

  const toggleShowBrush = (newState: boolean) => {
    if (newState !== showBrush && !isPanning) {
      setShowBrush(newState)
    }
  }

  const getCursor = useCallback(() => {
    if (isPanning) {
      return 'grab'
    }
    if (showBrush) {
      return 'none'
    }
    return undefined
  }, [showBrush, isPanning])

  // Toggle clean/zoom tool on spacebar.
  useKeyPressEvent(
    ' ',
    ev => {
      ev?.preventDefault()
      ev?.stopPropagation()
      console.log('space click')
      if (isInteractiveSeg) {
        beforeSpace = true
      }
      setShowBrush(false)
      setIsPanning(true)
    },
    ev => {
      ev?.preventDefault()
      ev?.stopPropagation()
      if (beforeSpace) {
        setShowBrush(true)
        setIsPanning(false)
        setIsInpainting(false)
        beforeSpace = false
        setIsInteractiveSeg(true)
      } else {
        setShowBrush(true)
        setIsPanning(false)
      }
    }
  )

  const getCurScale = (): number => {
    let s = minScale
    if (viewportRef.current?.state.scale !== undefined) {
      s = viewportRef.current?.state.scale
    }
    return s!
  }

  const getBrushStyle = (_x: number, _y: number) => {
    const curScale = getCurScale()
    return {
      width: `${brushSize * curScale}px`,
      height: `${brushSize * curScale}px`,
      left: `${_x}px`,
      top: `${_y}px`,
      transform: 'translate(-50%, -50%)',
    }
  }

  const handleSliderChange = (value: number) => {
    setBrushSize(value)

    if (!showRefBrush) {
      setShowRefBrush(true)
      window.setTimeout(() => {
        setShowRefBrush(false)
      }, 10000)
    }
  }

  const renderFileSelect = () => {
    return (
      <div className="landing-file-selector">
        <FileSelect
          onSelection={async f => {
            setFile(f)
          }}
        />
      </div>
    )
  }

  const renderInteractiveSegCursor = () => {
    return (
      <div
        className="interactive-seg-cursor"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          // transform: 'translate(-50%, -50%)',
        }}
      >
        <CursorArrowRaysIcon />
      </div>
    )
  }

  const renderCanvas = () => {
    return (
      <TransformWrapper
        ref={r => {
          if (r) {
            viewportRef.current = r
          }
        }}
        panning={{ disabled: !isPanning, velocityDisabled: true }}
        wheel={{ step: 0.05 }}
        centerZoomedOut
        alignmentAnimation={{ disabled: true }}
        // centerOnInit
        limitToBounds={false}
        doubleClick={{ disabled: true }}
        initialScale={minScale}
        minScale={minScale * 0.6}
        onPanning={ref => {
          if (!panned) {
            setPanned(true)
          }
        }}
        onZoom={ref => {
          setScale(ref.state.scale)
        }}
      >
        <TransformComponent
          contentClass={
            isInpainting || isInteractiveSegRunning
              ? 'editor-canvas-loading'
              : ''
          }
          contentStyle={{
            visibility: initialCentered ? 'visible' : 'hidden',
          }}
        >
          <div className="editor-canvas-container">
            <canvas
              draggable
              className="editor-canvas"
              style={{
                cursor: getCursor(),
                clipPath: `inset(0 ${sliderPos}% 0 0)`,
                transition: 'clip-path 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onContextMenu={e => {
                e.preventDefault()
              }}
              onMouseOver={() => {
                toggleShowBrush(true)
                setShowRefBrush(false)
              }}
              onFocus={() => toggleShowBrush(true)}
              onMouseLeave={() => toggleShowBrush(false)}
              onMouseDown={onMouseDown}
              onMouseUp={onCanvasMouseUp}
              onMouseMove={onMouseDrag}
              ref={r => {
                if (r && !context) {
                  const ctx = r.getContext('2d')
                  if (ctx) {
                    setContext(ctx)
                  }
                }
              }}
            />
            <div
              className="original-image-container"
              style={{
                width: `${original.naturalWidth}px`,
                height: `${original.naturalHeight}px`,
              }}
            >
              {showOriginal && (
                <div
                  className="editor-slider"
                  style={{
                    marginRight: `${sliderPos}%`,
                  }}
                />
              )}
              <img
                className="original-image"
                src={original.src}
                alt="original"
                style={{
                  width: `${original.naturalWidth}px`,
                  height: `${original.naturalHeight}px`,
                }}
              />
            </div>
          </div>
          {isInteractiveSeg ? <InteractiveSeg /> : <></>}
        </TransformComponent>
      </TransformWrapper>
    )
  }
  const dragImage = () => {
    setIsInteractiveSeg(false)
    setShowBrush(false)
    setIsPanning(true)
  }
  const onInteractiveAccept = () => {
    setInteractiveSegMask(tmpInteractiveSegMask)
    setTmpInteractiveSegMask(null)

    if (tmpInteractiveSegMask) {
      runInpainting(false, undefined, tmpInteractiveSegMask)
    }
  }

  return (
    <div
      className="editor-container"
      aria-hidden="true"
      onMouseMove={onMouseMove}
      onMouseUp={onPointerUp}
    >
      <InteractiveSegConfirmActions
        onAcceptClick={onInteractiveAccept}
        onCancelClick={onInteractiveCancel}
      />
      {file === undefined ? renderFileSelect() : renderCanvas()}

      {showBrush &&
        !isInpainting &&
        !isPanning &&
        (isInteractiveSeg ? (
          renderInteractiveSegCursor()
        ) : (
          <div
            className="brush-shape"
            style={getBrushStyle(
              isChangingBrushSizeByMouse ? changeBrushSizeByMouseInit.x : x,
              isChangingBrushSizeByMouse ? changeBrushSizeByMouseInit.y : y
            )}
          />
        ))}

      {showRefBrush && (
        <div
          className="brush-shape"
          style={getBrushStyle(windowCenterX, windowCenterY)}
        />
      )}

      <div className="editor-toolkit-panel">
        <Button
          tooltipPosition="top"
          toolTip="笔刷"
          icon={<PaintBrushIcon />}
          disabled={isInteractiveSeg || isInpainting || !isOriginalLoaded}
          onClick={() => {
            setShowBrush(true)
            setIsInteractiveSeg(false)
            setIsPanning(false)
          }}
        />
        <Slider
          min={MIN_BRUSH_SIZE}
          max={MAX_BRUSH_SIZE}
          value={brushSize}
          onChange={handleSliderChange}
          onClick={() => setShowRefBrush(false)}
        />
        <div className="editor-toolkit-btns">
          <Button
            toolTip="快速选择工具"
            tooltipPosition="top"
            icon={<CursorArrowRaysIcon />}
            disabled={isInteractiveSeg || isInpainting || !isOriginalLoaded}
            onClick={() => {
              setIsInteractiveSeg(true)
              setIsPanning(false)
              if (interactiveSegMask !== null) {
                setShowInteractiveSegModal(true)
              }
            }}
          />
          <Button
            toolTip="拖拽"
            tooltipPosition="top"
            icon={<HandRaisedIcon />}
            disabled={isPanning || !isOriginalLoaded}
            onClick={dragImage}
          />
          <Button
            toolTip="恢复比例"
            tooltipPosition="top"
            icon={<ArrowsPointingOutIcon />}
            disabled={scale === minScale && panned === false}
            onClick={resetZoom}
          />
          <Button
            toolTip="前一步"
            tooltipPosition="top"
            icon={
              <svg
                width="19"
                height="9"
                viewBox="0 0 19 9"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1H2ZM1 8H0V9H1V8ZM8 9C8.55228 9 9 8.55229 9 8C9 7.44771 8.55228 7 8 7V9ZM16.5963 7.42809C16.8327 7.92721 17.429 8.14016 17.9281 7.90374C18.4272 7.66731 18.6402 7.07103 18.4037 6.57191L16.5963 7.42809ZM16.9468 5.83205L17.8505 5.40396L16.9468 5.83205ZM0 1V8H2V1H0ZM1 9H8V7H1V9ZM1.66896 8.74329L6.66896 4.24329L5.33104 2.75671L0.331035 7.25671L1.66896 8.74329ZM16.043 6.26014L16.5963 7.42809L18.4037 6.57191L17.8505 5.40396L16.043 6.26014ZM6.65079 4.25926C9.67554 1.66661 14.3376 2.65979 16.043 6.26014L17.8505 5.40396C15.5805 0.61182 9.37523 -0.710131 5.34921 2.74074L6.65079 4.25926Z"
                  fill="currentColor"
                />
              </svg>
            }
            onClick={undo}
            disabled={disableUndo()}
          />
          <Button
            toolTip="后一步"
            tooltipPosition="top"
            icon={
              <svg
                width="19"
                height="9"
                viewBox="0 0 19 9"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ transform: 'scale(-1,1)' }}
              >
                <path
                  d="M2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1H2ZM1 8H0V9H1V8ZM8 9C8.55228 9 9 8.55229 9 8C9 7.44771 8.55228 7 8 7V9ZM16.5963 7.42809C16.8327 7.92721 17.429 8.14016 17.9281 7.90374C18.4272 7.66731 18.6402 7.07103 18.4037 6.57191L16.5963 7.42809ZM16.9468 5.83205L17.8505 5.40396L16.9468 5.83205ZM0 1V8H2V1H0ZM1 9H8V7H1V9ZM1.66896 8.74329L6.66896 4.24329L5.33104 2.75671L0.331035 7.25671L1.66896 8.74329ZM16.043 6.26014L16.5963 7.42809L18.4037 6.57191L17.8505 5.40396L16.043 6.26014ZM6.65079 4.25926C9.67554 1.66661 14.3376 2.65979 16.043 6.26014L17.8505 5.40396C15.5805 0.61182 9.37523 -0.710131 5.34921 2.74074L6.65079 4.25926Z"
                  fill="currentColor"
                />
              </svg>
            }
            onClick={redo}
            disabled={disableRedo()}
          />
          <Button
            toolTip="对比"
            tooltipPosition="top"
            icon={<EyeIcon />}
            className={showOriginal ? 'eyeicon-active' : ''}
            onDown={ev => {
              ev.preventDefault()
              setShowOriginal(() => {
                window.setTimeout(() => {
                  setSliderPos(100)
                }, 10)
                return true
              })
            }}
            onUp={() => {
              setSliderPos(0)
              window.setTimeout(() => {
                setShowOriginal(false)
              }, 300)
            }}
            disabled={renders.length === 0}
          />
          <Button
            toolTip="保存"
            tooltipPosition="top"
            icon={<ArrowDownTrayIcon />}
            disabled={!renders.length}
            onClick={download}
          />
        </div>
      </div>
      <InteractiveSegReplaceModal
        show={showInteractiveSegModal}
        onClose={() => {
          onInteractiveCancel()
          setShowInteractiveSegModal(false)
        }}
        onCleanClick={() => {
          onInteractiveCancel()
          setInteractiveSegMask(null)
        }}
        onReplaceClick={() => {
          setShowInteractiveSegModal(false)
          setIsInteractiveSeg(true)
        }}
      />
    </div>
  )
}

export default Editor
