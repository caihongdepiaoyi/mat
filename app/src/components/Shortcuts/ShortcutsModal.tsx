import React, { ReactNode } from 'react'
import { useRecoilState } from 'recoil'
import { shortcutsState } from '../../store/Atoms'
import Modal from '../shared/Modal'

interface Shortcut {
  content: string
  keys: string[]
}

function ShortCut(props: Shortcut) {
  const { content, keys } = props

  return (
    <div className="shortcut-option">
      <div className="shortcut-description">{content}</div>
      <div style={{ display: 'flex', justifySelf: 'end', gap: '8px' }}>
        {keys.map((k, index) => (
          <div className="shortcut-key" key={k}>
            {k}
          </div>
        ))}
      </div>
    </div>
  )
}

const isMac = (function () {
  return /macintosh|mac os x/i.test(navigator.userAgent)
})()

const isWindows = (function () {
  return /windows|win32/i.test(navigator.userAgent)
})()

const CmdOrCtrl = isMac ? 'Cmd' : 'Ctrl'

export default function ShortcutsModal() {
  const [shortcutsShow, setShortcutState] = useRecoilState(shortcutsState)

  const shortcutStateHandler = () => {
    setShortcutState(false)
  }

  return (
    <Modal
      onClose={shortcutStateHandler}
      title="如何使用&&快捷键"
      className="modal-shortcuts"
      show={shortcutsShow}
    >
      <div className="shortcut-options">
        <div>1. 点击上传或者拖拽图片至网页</div>
        <div>2. 使用笔刷选择想要去除的区域</div>
        <div>3. 或者可以使用快速选择工具进行选择</div>
        <div>4. 选择后等待几秒即可得到修复后的图片</div>
        <br />
        <ShortCut content="图片拖拽" keys={['空格 + 鼠标左键']} />
        <ShortCut content="图片缩放" keys={['鼠标中键']} />
      </div>
    </Modal>
  )
}
