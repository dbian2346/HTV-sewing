export function validateImage(upload) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(upload.data)) throw new Error('Invalid image encoding. Choose the image again.');
  const bytes = Buffer.from(upload.data, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Images must be no larger than 8 MB.');
  const matches = upload.mimeType === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : upload.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!matches) throw new Error('The image format does not match its contents. Choose a valid JPG, PNG or WebP.');
}
