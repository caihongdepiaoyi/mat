import {
  ArrowUpTrayIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { PlayIcon } from '@radix-ui/react-icons'
import * as Dialog from '@radix-ui/react-dialog'
import React, { useState } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import {
  fileState,
  interactiveSegClicksState,
  isInpaintingState,
  maskState,
  shortcutsState,
} from '../../store/Atoms'
import Button from '../shared/Button'
import Shortcuts from '../Shortcuts/Shortcuts'
import { ThemeChanger } from './ThemeChanger'

const Header = () => {
  const isInpainting = useRecoilValue(isInpaintingState)
  const [file, setFile] = useRecoilState(fileState)
  const [mask, setMask] = useRecoilState(maskState)
  const [uploadElemId] = useState(`file-upload-${Math.random().toString()}`)
  const [maskUploadElemId] = useState(`mask-upload-${Math.random().toString()}`)
  const [shortcutVisibility, setShortcutState] = useRecoilState(shortcutsState)
  const help = () => {
    setShortcutState(true)
  }
  const renderHeader = () => {
    return (
      <header>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <label htmlFor={uploadElemId}>
            <Button
              icon={<ArrowUpTrayIcon />}
              style={{ border: 0 }}
              disabled={isInpainting}
              toolTip="打开图片"
              tooltipPosition="bottom"
            >
              <input
                style={{ display: 'none' }}
                id={uploadElemId}
                name={uploadElemId}
                type="file"
                onChange={ev => {
                  const newFile = ev.currentTarget.files?.[0]
                  if (newFile) {
                    setFile(newFile)
                  }
                }}
                accept="image/png, image/jpeg"
              />
              上传
            </Button>
          </label>
        </div>
        <div className="header-icons-wrapper">
          <Button
            toolTip="帮助"
            tooltipPosition="bottom"
            icon={<QuestionMarkCircleIcon />}
            onClick={help}
          />
          <ThemeChanger />
        </div>
      </header>
    )
  }
  return renderHeader()
}

export default Header
