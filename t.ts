import { fetchCover } from "@/format";
const r = await fetchCover("https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30656-nYhaEDLTeN5g.jpg");
console.log(r ? `ok ${r.length}` : "null");
