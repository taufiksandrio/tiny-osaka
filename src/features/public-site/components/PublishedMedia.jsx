"use client";

import { useState } from "react";

const PublishedMedia = ({ media, locale }) => {
  const [consent, setConsent] = useState(false);
  const youtube = media.asset.kind === "youtube" && /^[a-zA-Z0-9_-]{11}$/.test(media.asset.externalId || "");
  return <figure className="published-media">
    <div style={{ aspectRatio: `${media.asset.width || 16} / ${media.asset.height || 9}` }}>
      {youtube && consent ? <iframe title={media.alt} loading="lazy" width="640" height="360"
        src={`https://www.youtube-nocookie.com/embed/${media.asset.externalId}`} allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin" /> : <div className="media-placeholder" role={youtube ? "group" : "img"} aria-label={media.alt}>
        <p>{media.alt}</p>
        {youtube ? <><p>{locale === "id" ? "Memutar video akan menghubungkan ke YouTube." : "Playing connects to YouTube."}</p>
          <button className="button button-red" onClick={() => setConsent(true)}>{locale === "id" ? "Muat video YouTube" : "Load YouTube video"}</button></> :
          <p>{locale === "id" ? "Media belum tersedia." : "Media is not available yet."}</p>}
      </div>}
    </div>
    {media.caption && <figcaption>{media.caption}</figcaption>}
  </figure>;
};
export default PublishedMedia;
