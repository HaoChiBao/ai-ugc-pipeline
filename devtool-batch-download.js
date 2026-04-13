// this script is used to batch download images from the dom of a website
// paste into the console of the website you want to download images from
(async () => {
    const urls = new Set();
  
    // Get all <img> URLs
    document.querySelectorAll("img").forEach((img) => {
      const src = img.currentSrc || img.src;
      if (src) urls.add(src);
    });
  
    const imageUrls = [...urls]
      .map((url) => url.startsWith("//") ? location.protocol + url : url)
      .filter((url) => url && !url.startsWith("data:"));
  
    console.log(`Found ${imageUrls.length} image(s)`);
  
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  
    function getExtFromBlobType(type) {
      if (!type) return ".jpg";
      if (type.includes("png")) return ".png";
      if (type.includes("webp")) return ".webp";
      if (type.includes("gif")) return ".gif";
      if (type.includes("svg")) return ".svg";
      if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
      return ".jpg";
    }
  
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
  
      try {
        const res = await fetch(url, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store"
        });
  
        if (!res.ok) {
          console.warn(`Skipped ${url} - HTTP ${res.status}`);
          continue;
        }
  
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
  
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `image_${i + 1}${getExtFromBlobType(blob.type)}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
  
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  
        console.log(`Downloaded ${i + 1}/${imageUrls.length}: ${url}`);
        await delay(250);
      } catch (err) {
        console.warn(`Could not download: ${url}`, err);
      }
    }
  })();