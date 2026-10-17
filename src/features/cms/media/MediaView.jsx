import Image from "next/image";
export const mediaUrl = (id, preview) => `${preview ? "/api/cms/media" : "/media"}/${id}`;
const MediaView = ({ asset, alt, preview = true }) => {
  if (asset.kind === "image") return <Image src={mediaUrl(asset.id, preview)} alt={alt} width={asset.width} height={asset.height}
    unoptimized className="h-auto max-h-80 w-full object-contain" />;
  if (asset.kind === "video") return <video controls preload="none" aria-label={alt} width={asset.width} height={asset.height}
    poster={asset.posterId ? mediaUrl(asset.posterId, preview) : undefined} className="max-h-80 w-full" src={mediaUrl(asset.id, preview)} />;
  return <div className="grid gap-3 rounded-lg border p-4">{asset.posterId && <Image src={mediaUrl(asset.posterId, preview)} alt="" width={640} height={360}
    unoptimized className="h-48 w-full object-contain" />}<p className="text-sm">YouTube · {asset.externalId}</p></div>;
};
export default MediaView;
