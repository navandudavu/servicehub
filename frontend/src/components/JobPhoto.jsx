import { useEffect, useState } from 'react';
import { fetchPhotoUrl } from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function JobPhoto({ filename, onClick, style }) {
  const { t } = useLang();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    fetchPhotoUrl(filename)
      .then((u) => {
        if (cancelled) { URL.revokeObjectURL(u); return; }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename]);

  if (failed) {
    return (
      <div style={{
        ...style, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--paper)', color: 'var(--stone)', fontSize: 11
      }}>
        {t('jobPhoto_failedToLoad')}
      </div>
    );
  }

  if (!url) {
    return <div style={{ ...style, background: 'var(--paper)' }} />;
  }

  return (
    <img
      src={url}
      onClick={onClick}
      style={{ ...style, objectFit: 'cover', cursor: onClick ? 'pointer' : 'default' }}
      alt={t('jobModal_photos')}
    />
  );
}
