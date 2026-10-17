"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

const PublishedMedia = ({ media }) => {
  const [consent, setConsent] = useState(false);
  const [missing, setMissing] = useState(false);
  const [posterMissing, setPosterMissing] = useState(false);
  const youtube = media.asset.kind === "youtube" && /^[a-zA-Z0-9_-]{11}$/.test(media.asset.externalId || "");
  return <figure className="published-media">
    <div style={{ aspectRatio: `${media.asset.width || 16} / ${media.asset.height || 9}` }}>
      {media.asset.kind === "image" && !missing ? <Image src={`/media/${media.asset.id}`} alt={media.alt} width={media.asset.width} height={media.asset.height}
        unoptimized className="h-auto w-full object-contain" onError={() => setMissing(true)} /> : media.asset.kind === "video" && !missing ?
        <video controls preload="none" aria-label={media.alt} width={media.asset.width} height={media.asset.height} className="h-auto w-full" poster={media.poster ? `/media/${media.poster.id}` : undefined} src={`/media/${media.asset.id}`} onError={() => setMissing(true)} /> : youtube && consent ? <iframe title={media.alt} loading="lazy" width="640" height="360"
        src={`https://www.youtube-nocookie.com/embed/${media.asset.externalId}`} allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" /> : <div className="media-placeholder" role={youtube ? "group" : "img"} aria-label={media.alt}>
        {youtube && media.poster && !posterMissing && <Image src={`/media/${media.poster.id}`} alt="" width={media.poster.width} height={media.poster.height}
          unoptimized className="h-auto max-h-80 w-full object-contain" onError={() => setPosterMissing(true)} />}
        <p>{media.alt}</p>
        {youtube ? <><p>Memutar video akan menghubungkan ke YouTube.</p>
          <Button onClick={() => setConsent(true)}>Muat video YouTube</Button></> :
          <p>Media belum tersedia.</p>}
      </div>}
    </div>
    {media.caption && <figcaption>{media.caption}</figcaption>}
  </figure>;
};
export default PublishedMedia;
