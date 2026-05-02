import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { compressImage } from '../../lib/imageUtils';
import { Attachment } from '../../types/trip';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';

interface FileUploadProps {
  onUploadComplete: (attachment: Attachment) => void;
  folderName: string;
  bucketName?: string;
  isPrivate?: boolean;
}

export function FileUpload({
  onUploadComplete,
  folderName,
  bucketName = 'trip-attachments',
  isPrivate = false,
}: FileUploadProps) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    // Check size limit (15MB)
    if (file.size > 15 * 1024 * 1024) {
        toast.error(t('trips.fileTooLarge') || 'File size must be less than 15MB');
        return;
    }

    setUploading(true);

    try {
      // 1. Compress if image
      const processedFile = await compressImage(file);
      
      // 2. Upload to Supabase Storage
      const fileExt = processedFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${folderName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, processedFile);

      if (uploadError) throw uploadError;

      // 4. Determine type
      const type = file.type.startsWith('image/') 
        ? 'other' 
        : file.type.includes('pdf') ? 'voucher' : 'other';

      onUploadComplete({
        file_name: file.name,
        url: isPrivate ? `storage://${bucketName}/${filePath}` : supabase.storage.from(bucketName).getPublicUrl(filePath).data.publicUrl,
        type: type as Attachment['type'],
        bucket: isPrivate ? bucketName : undefined,
        storage_path: isPrivate ? filePath : undefined,
      });
      
      toast.success('File uploaded successfully');

    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,application/pdf" 
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors w-full justify-center border border-dashed border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
            <Upload className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">
            {uploading ? t('trips.uploading') || 'Uploading...' : t('trips.uploadFile')}
        </span>
      </button>
    </div>
  );
}
