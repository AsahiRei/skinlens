declare module "jpeg-js" {
  interface JpegBuffer {
    data: Uint8Array;
    width: number;
    height: number;
    exifBuffer?: Uint8Array;
    comments?: string[];
  }

  interface DecodeOptions {
    colorTransform?: boolean;
    useTArray?: boolean;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
    maxResolutionInMP?: number;
    maxMemoryUsageInMB?: number;
  }

  interface EncodeOptions {
    // unused, quality is passed as second argument
  }

  function decode(jpegData: Uint8Array, opts?: DecodeOptions): JpegBuffer;
  function encode(
    imageData: { data: Uint8Array; width: number; height: number },
    quality?: number,
  ): { data: Uint8Array; width: number; height: number };
}
