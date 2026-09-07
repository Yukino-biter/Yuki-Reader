/** djb2 32 位字符串哈希（同步、无依赖），用作缓存 key 的内容指纹。 */
export function djb2(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
