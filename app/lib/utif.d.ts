declare module 'utif' {
  export interface UtifIfd {
    // Populated only after decodeImage() runs on this ifd.
    width?: number
    height?: number
    // Raw TIFF tags — t256 = ImageWidth, t257 = ImageLength — already
    // present right after decode(), before any page has been decoded.
    t256?: number[]
    t257?: number[]
    [key: string]: unknown
  }
  export function decode(buffer: ArrayBuffer | Uint8Array): UtifIfd[]
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: UtifIfd, ifds?: UtifIfd[]): void
  export function toRGBA8(ifd: UtifIfd): Uint8Array
}
