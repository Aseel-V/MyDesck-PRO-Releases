
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyBucket() {
  console.log('Testing Write Access to "restaurant-assets"...');
  
  const fileName = `verification_write_test_${Date.now()}.txt`;
  const fileBody = 'This is a test file to verify WRITE permission.';

  const { data, error } = await supabase.storage
    .from('restaurant-assets')
    .upload(fileName, fileBody);

  if (error) {
    if (error.message.includes('row-level security') || error.message.includes('policy')) {
      console.log('FAILURE: Still getting RLS/Permission Error!', error.message);
    } else if (error.message.includes('Bucket not found')) {
      console.log('FAILURE: Bucket not found (Did it get deleted?).', error.message);
    } else {
      console.log('FAILURE: Upload error:', error.message);
    }
    process.exit(1);
  }

  console.log('SUCCESS: File uploaded successfully! Write permissions are correct.');
  
  // Cleanup
  await supabase.storage.from('restaurant-assets').remove([fileName]);
  console.log('Cleanup: Test file deleted.');
  
  process.exit(0);
}

verifyBucket();
