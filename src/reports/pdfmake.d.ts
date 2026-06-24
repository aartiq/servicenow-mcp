declare module 'pdfmake/build/pdfmake.js' {
  const pdfmake: {
    virtualfs: { storage: Record<string, unknown> };
    fonts: Record<string, Record<string, string>>;
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(docDefinition: any, options?: any): {
      getBuffer(): Promise<Uint8Array>;
      getBase64(): Promise<string>;
      getStream(): Promise<NodeJS.ReadableStream>;
      bufferPromise: Promise<Uint8Array> | null;
    };
  };
  export default pdfmake;
}

declare module 'pdfmake/build/vfs_fonts.js' {
  const vfsFonts: Record<string, string>;
  export default vfsFonts;
}
