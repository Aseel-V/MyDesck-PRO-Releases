
import { useState, useEffect } from 'react';

const REPO_OWNER = 'Aseel-V';
const REPO_NAME = 'MyDesck-PRO-Releases';

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

export interface ReleaseData {
  tag_name: string;
  published_at: string;
  assets: ReleaseAsset[];
}

export function useGitHubRelease() {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRelease = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
        if (!response.ok) throw new Error('Failed to fetch release');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();
  }, []);

  return { data, loading, error };
}
