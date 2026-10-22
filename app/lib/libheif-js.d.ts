declare module 'libheif-js/wasm-bundle' {
  export interface HeifImage {
    get_width(): number
    get_height(): number
    display(
      imageData: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void
    ): void
  }
  export interface HeifDecoder {
    decode(buffer: ArrayBuffer | Uint8Array): HeifImage[]
  }
  export interface LibheifModule {
    HeifDecoder: new () => HeifDecoder
  }
  const libheifPromise: Promise<LibheifModule>
  export default libheifPromise
}
