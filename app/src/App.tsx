import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRecoilState } from 'recoil'
import { nanoid } from 'nanoid'
import { themeState } from './components/Header/ThemeChanger'
import Workspace from './components/Workspace'
import { fileState, toastState } from './store/Atoms'
import Header from './components/Header/Header'

const SUPPORTED_FILE_TYPE = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
]

function App() {
  const [file, setFile] = useRecoilState(fileState)
  const [theme, setTheme] = useRecoilState(themeState)
  const [toastVal, setToastState] = useRecoilState(toastState)

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  const workspaceId = useMemo(() => {
    return nanoid()
  }, [file])

  ///

  const [isDragging, setIsDragging] = React.useState(false)
  const dragCounter = React.useRef(0)

  const handleDrag = React.useCallback(event => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleDragIn = React.useCallback(event => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current += 1
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragOut = React.useCallback(event => {
    event.preventDefault()
    event.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current > 0) return
    setIsDragging(false)
  }, [])

  const handleDrop = React.useCallback(event => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      if (event.dataTransfer.files.length > 1) {
        setToastState({
          open: true,
          desc: 'Please drag and drop only one file',
          state: 'error',
          duration: 3000,
        })
      } else {
        const dragFile = event.dataTransfer.files[0]
        const fileType = dragFile.type
        if (SUPPORTED_FILE_TYPE.includes(fileType)) {
          setFile(dragFile)
        } else {
          setToastState({
            open: true,
            desc: 'Please drag and drop an image file',
            state: 'error',
            duration: 3000,
          })
        }
      }
      event.dataTransfer.clearData()
    }
  }, [])

  const onPaste = useCallback((event: any) => {
    if (!event.clipboardData) {
      return
    }
    const clipboardItems = event.clipboardData.items
    const items: DataTransferItem[] = [].slice
      .call(clipboardItems)
      .filter((item: DataTransferItem) => {
        // Filter the image items only
        return item.type.indexOf('image') !== -1
      })

    if (items.length === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    // TODO: add confirm dialog

    const item = items[0]
    // Get the blob of image
    const blob = item.getAsFile()
    if (blob) {
      setFile(blob)
    }
  }, [])

  React.useEffect(() => {
    window.addEventListener('dragenter', handleDragIn)
    window.addEventListener('dragleave', handleDragOut)
    window.addEventListener('dragover', handleDrag)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('paste', onPaste)
    return function cleanUp() {
      window.removeEventListener('dragenter', handleDragIn)
      window.removeEventListener('dragleave', handleDragOut)
      window.removeEventListener('dragover', handleDrag)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('paste', onPaste)
    }
  })

  return (
    <div className="mat">
      <Header />
      <Workspace key={workspaceId} />
    </div>
  )
}

export default App
