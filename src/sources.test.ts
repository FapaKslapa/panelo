import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBnf } from "@/sources/bnf";
import { fromRecord } from "@/sources/sbn";
import { fromVolume } from "@/sources/googlebooks";

test("BnF Dublin Core record becomes a comic", () => {
  const xml = `<srw:records xmlns:srw="s" xmlns:oai_dc="o" xmlns:dc="d"><srw:record><oai_dc:dc>
    <dc:identifier>https://catalogue.bnf.fr/ark:/12148/cb123</dc:identifier>
    <dc:identifier>ISBN 9782723456789</dc:identifier>
    <dc:title>Berserk / Kentaro Miura</dc:title>
    <dc:contributor>Miura, Kentaro (1966-2021). Auteur du texte</dc:contributor>
    <dc:publisher>Glénat (Grenoble)</dc:publisher>
    <dc:date>2004</dc:date><dc:language>fre</dc:language>
  </oai_dc:dc></srw:record></srw:records>`;
  const [c] = parseBnf(xml);
  assert.equal(c?.title, "Berserk");
  assert.equal(c?.sourceId, "ark:/12148/cb123");
  assert.equal(c?.isbn, "9782723456789");
  assert.deepEqual(c?.authors, ["Miura, Kentaro"]);
  assert.equal(c?.year, 2004);
});

test("SBN record yields title, publisher and year from the publication string", () => {
  const [c] = fromRecord({ codiceIdentificativo: "IT\\ICCU\\1", titolo: "Dylan Dog / Sclavi", pubblicazione: "Milano : Bonelli, 1991" });
  assert.equal(c?.title, "Dylan Dog");
  assert.equal(c?.publisher, "Bonelli");
  assert.equal(c?.year, 1991);
});

test("Google Books volume keeps year, isbn, language and an https cover", () => {
  const [c] = fromVolume({
    id: "abc",
    volumeInfo: {
      title: "Leo", authors: ["A. Autor"], publisher: "Editora X", publishedDate: "2015-03-01", language: "pt",
      industryIdentifiers: [{ type: "ISBN_10", identifier: "8512345678" }, { type: "ISBN_13", identifier: "9788512345678" }],
      imageLinks: { thumbnail: "http://books.google.com/c.jpg" },
    },
  });
  assert.equal(c?.year, 2015);
  assert.equal(c?.isbn, "9788512345678");
  assert.deepEqual(c?.languages, ["pt"]);
  assert.equal(c?.cover, "https://books.google.com/c.jpg");
});
