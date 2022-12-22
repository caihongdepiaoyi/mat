import { dataURItoBlob } from '../utils'

export const API_ENDPOINT = `${process.env.REACT_APP_INPAINTING_URL}`

export default async function inpaint(
  imageFile: File,
  maskBase64?: string,
  customMask?: File
) {
  // 1080, 2000, Original
  const fd = new FormData()
  fd.append('image', imageFile)
  if (maskBase64 !== undefined) {
    fd.append('mask', dataURItoBlob(maskBase64))
  } else if (customMask !== undefined) {
    fd.append('mask', customMask)
  }

  try {
    console.log(fd)
    const res = await fetch(`${API_ENDPOINT}/inpaint`, {
      method: 'POST',
      body: fd,
    })
    if (res.ok) {
      const blob = await res.blob()
      console.log(blob)
      const newSeed = res.headers.get('x-seed')
      return { blob: URL.createObjectURL(blob), seed: newSeed }
    }
    const errMsg = await res.text()
    throw new Error(errMsg)
  } catch (error) {
    throw new Error(`Something went wrong: ${error}`)
  }
}

export async function postInteractiveSeg(
  imageFile: File,
  maskFile: File | null,
  clicks: number[][]
) {
  const fd = new FormData()
  fd.append('image', imageFile)
  fd.append('clicks', JSON.stringify(clicks))
  if (maskFile !== null) {
    fd.append('mask', maskFile)
  }

  try {
    const res = await fetch(`${API_ENDPOINT}/interactive_seg`, {
      method: 'POST',
      body: fd,
    })
    if (res.ok) {
      const blob = await res.blob()
      return { blob: URL.createObjectURL(blob) }
    }
    const errMsg = await res.text()
    throw new Error(errMsg)
  } catch (error) {
    throw new Error(`Something went wrong: ${error}`)
  }
}
