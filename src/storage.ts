export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = navigator.storage
  if (!storage?.persist) return null
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}
