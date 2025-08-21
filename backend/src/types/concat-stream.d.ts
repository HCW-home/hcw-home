declare module 'concat-stream' {
  import { Writable } from 'stream';

  function concat(cb: (data: Buffer) => void): Writable;

  export default concat;
}
