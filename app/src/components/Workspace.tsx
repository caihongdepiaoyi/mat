import React, { useCallback, useEffect } from 'react'
import { useRecoilState, useRecoilValue } from 'recoil'
import Editor from './Editor/Editor'
import ShortcutsModal from './Shortcuts/ShortcutsModal'
import Toast from './shared/Toast'
import { toastState } from '../store/Atoms'

const Workspace = () => {
  const [toastVal, setToastState] = useRecoilState(toastState)

  return (
    <>
      <Editor />
      <ShortcutsModal />
      <Toast
        {...toastVal}
        onOpenChange={(open: boolean) => {
          setToastState(old => {
            return { ...old, open }
          })
        }}
      />
    </>
  )
}

export default Workspace
