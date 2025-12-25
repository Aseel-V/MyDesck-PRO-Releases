import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file to ensure it's below a certain size (default 1MB).
 * Useful before uploading to Supabase Storage to save bandwidth and quota.
 */
export async function compressImage(file: File): Promise<File> {
  // Options for compression
  const options = {
    maxSizeMB: 1,          // (default: 1MB)
    maxWidthOrHeight: 1920, // (default: 1920px)
    useWebWorker: true,
  };

  try {
    // Only compress images
    if (!file.type.startsWith('image/')) {
      return file;
    }

    const compressedFile = await imageCompression(file, options);
    
    // If compression actually made it larger (rare but possible for tiny optimized images), return original
    if (compressedFile.size > file.size) {
        return file;
    }

    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    // Fallback to original file
    return file;
  }
}

/**
 * Resizes an image to specified dimensions (approximate) and compresses it.
 * This is used by Settings.tsx for logo uploads.
 */
export async function resizeImage(file: File, width: number, height: number): Promise<Blob> {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: Math.max(width, height),
    useWebWorker: true,
  };
  
  try {
     const compressed = await imageCompression(file, options);
     return compressed;
  } catch (e) {
      console.error("Resize failed", e);
      return file; // Fallback
  }
}
