// ============================================================
// xlsx.js — 외부 라이브러리 없이 엑셀(.xlsx) 파일을 만드는 작은 도구
// 서식(글꼴·배경·테두리·표시형식), 병합, 틀고정, 필터, 조건부 서식, 수식을 지원합니다.
// 사용: const blob = XlsxLite.build({ sheets: [ ... ] });
// ============================================================
(function (root) {
  "use strict";

  // ---------- 공통 ----------
  const enc = new TextEncoder();
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // 엑셀이 허용하지 않는 제어문자 제거 (줄바꿈·탭은 유지)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  function colName(n) { // 1 -> A
    let s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function ref(r, c) { return colName(c) + r; }

  // "2026-10-08" -> 엑셀 날짜 일련번호
  function dateSerial(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
    if (!m) return null;
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  // ---------- 스타일 등록부 ----------
  // style = { font:{name,sz,b,color}, fill:"FFRRGGBB", align:{h,v,wrap}, border:{l,r,t,b:[style,color]}, numFmt:"m/d" }
  function StyleBook() {
    this.fonts = ['<font><sz val="9"/><color rgb="FF000000"/><name val="맑은 고딕"/><family val="2"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = [];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.dxfs = [];
    this._idx = { font: {}, fill: {}, border: {}, numFmt: {}, xf: {} };
  }
  StyleBook.prototype._add = function (kind, list, xml) {
    const map = this._idx[kind];
    if (map[xml] == null) { map[xml] = list.length; list.push(xml); }
    return map[xml];
  };
  StyleBook.prototype.fontXml = function (f) {
    f = f || {};
    return "<font>" + (f.b ? "<b/>" : "") + (f.i ? "<i/>" : "") +
      `<sz val="${f.sz || 9}"/><color rgb="${f.color || "FF000000"}"/><name val="${esc(f.name || "맑은 고딕")}"/><family val="2"/></font>`;
  };
  StyleBook.prototype.fillXml = function (rgb) {
    return `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  };
  StyleBook.prototype.borderXml = function (b) {
    const side = (tag, v) => v ? `<${tag} style="${v[0]}"><color rgb="${v[1] || "FF999999"}"/></${tag}>` : `<${tag}/>`;
    return "<border>" + side("left", b.l) + side("right", b.r) + side("top", b.t) + side("bottom", b.b) + "<diagonal/></border>";
  };
  StyleBook.prototype.id = function (s) {
    if (!s) return 0;
    const fontId = this._add("font", this.fonts, this.fontXml(s.font));
    const fillId = s.fill ? this._add("fill", this.fills, this.fillXml(s.fill)) : 0;
    const borderId = s.border ? this._add("border", this.borders, this.borderXml(s.border)) : 0;
    let numFmtId = 0;
    if (s.numFmt) {
      const builtin = { "General": 0, "0": 1, "0.00": 2, "0%": 9, "0.00%": 10, "@": 49 };
      if (builtin[s.numFmt] != null) numFmtId = builtin[s.numFmt];
      else {
        const map = this._idx.numFmt;
        if (map[s.numFmt] == null) { map[s.numFmt] = 164 + this.numFmts.length; this.numFmts.push(s.numFmt); }
        numFmtId = map[s.numFmt];
      }
    }
    const a = s.align || {};
    const alignXml = (a.h || a.v || a.wrap)
      ? `<alignment${a.h ? ` horizontal="${a.h}"` : ""}${a.v ? ` vertical="${a.v}"` : ""}${a.wrap ? ' wrapText="1"' : ""}/>` : "";
    const xml = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${alignXml ? ' applyAlignment="1">' + alignXml + "</xf>" : "/>"}`;
    return this._add("xf", this.xfs, xml);
  };
  // 조건부 서식용 (글자색 / 배경색)
  StyleBook.prototype.dxf = function (d) {
    const font = (d.color || d.b) ? `<font>${d.b ? "<b/>" : ""}${d.color ? `<color rgb="${d.color}"/>` : ""}</font>` : "";
    const fill = d.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${d.fill}"/><bgColor rgb="${d.fill}"/></patternFill></fill>` : "";
    this.dxfs.push(`<dxf>${font}${fill}</dxf>`);
    return this.dxfs.length - 1;
  };
  StyleBook.prototype.xml = function () {
    const nf = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">` + this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("") + "</numFmts>" : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + nf +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      `<dxfs count="${this.dxfs.length}">${this.dxfs.join("")}</dxfs>` +
      "</styleSheet>";
  };

  // ---------- 시트 ----------
  // sheet = { name, cols:[{c, width}], rowHeights:{r:h}, cells:[{r,c,v,f,s,date}], merges:["B5:G5"],
  //           freeze:{row, col}, autoFilter:"B6:Z20", landscapeFit:true(가로·너비 맞춤 인쇄), cf:[{sqref, rules:[{type:"expression"|"cellIs", formula, dxf:{...}}]}] }
  function sheetXml(sh, book) {
    const rows = {};
    (sh.cells || []).forEach(cell => { (rows[cell.r] = rows[cell.r] || []).push(cell); });
    const rowNums = Object.keys(rows).map(Number);
    Object.keys(sh.rowHeights || {}).forEach(r => { if (!rows[r]) { rows[r] = []; rowNums.push(+r); } });
    rowNums.sort((a, b) => a - b);

    let data = "";
    rowNums.forEach(r => {
      const h = (sh.rowHeights || {})[r];
      data += `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ""}>`;
      rows[r].sort((a, b) => a.c - b.c).forEach(cell => {
        const s = book.id(cell.s);
        const at = `r="${ref(r, cell.c)}"${s ? ` s="${s}"` : ""}`;
        if (cell.f != null) {
          data += `<c ${at}><f>${esc(cell.f)}</f></c>`;
        } else if (cell.date) {
          const n = dateSerial(cell.date);
          data += n == null ? `<c ${at}/>` : `<c ${at}><v>${n}</v></c>`;
        } else if (typeof cell.v === "number" && isFinite(cell.v)) {
          data += `<c ${at}><v>${cell.v}</v></c>`;
        } else if (cell.v != null && cell.v !== "") {
          data += `<c ${at} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
        } else {
          data += `<c ${at}/>`;
        }
      });
      data += "</row>";
    });

    let views = '<sheetViews><sheetView workbookViewId="0" zoomScale="100">';
    if (sh.freeze && (sh.freeze.row || sh.freeze.col)) {
      const fr = sh.freeze.row || 0, fc = sh.freeze.col || 0;
      const pane = fr && fc ? "bottomRight" : fr ? "bottomLeft" : "topRight";
      views += `<pane${fc ? ` xSplit="${fc}"` : ""}${fr ? ` ySplit="${fr}"` : ""} topLeftCell="${ref(fr + 1, fc + 1)}" activePane="${pane}" state="frozen"/>` +
        `<selection pane="${pane}" activeCell="${ref(fr + 1, fc + 1)}" sqref="${ref(fr + 1, fc + 1)}"/>`;
    }
    views += "</sheetView></sheetViews>";

    const cols = (sh.cols || []).length
      ? "<cols>" + sh.cols.map(c => `<col min="${c.c}" max="${c.c}" width="${c.width}" customWidth="1"/>`).join("") + "</cols>" : "";
    const filter = sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : "";
    const merges = (sh.merges || []).length
      ? `<mergeCells count="${sh.merges.length}">` + sh.merges.map(m => `<mergeCell ref="${m}"/>`).join("") + "</mergeCells>" : "";
    let prio = 1;
    const cf = (sh.cf || []).map(block =>
      `<conditionalFormatting sqref="${block.sqref}">` +
      block.rules.map(rule => {
        const dxfId = book.dxf(rule.dxf || {});
        if (rule.type === "cellIs") {
          return `<cfRule type="cellIs" dxfId="${dxfId}" priority="${prio++}" operator="${rule.operator || "equal"}"><formula>${esc(rule.formula)}</formula></cfRule>`;
        }
        return `<cfRule type="expression" dxfId="${dxfId}" priority="${prio++}"${rule.stop ? ' stopIfTrue="1"' : ""}><formula>${esc(rule.formula)}</formula></cfRule>`;
      }).join("") + "</conditionalFormatting>").join("");

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheetPr><outlinePr summaryBelow="0"/>${sh.landscapeFit ? '<pageSetUpPr fitToPage="1"/>' : ""}</sheetPr>` + views +
      '<sheetFormatPr defaultRowHeight="16.5"/>' + cols + `<sheetData>${data}</sheetData>` + filter + merges + cf +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      (sh.landscapeFit ? '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : "") +
      "</worksheet>";
  }

  // ---------- ZIP (무압축) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function zip(files) { // [{name, data:Uint8Array}]
    const parts = [], central = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; all.forEach(b => { out.set(b, p); p += b.length; });
    return out;
  }

  // ---------- 통합 문서 ----------
  function buildBytes(wb) {
    const book = new StyleBook();
    const sheets = wb.sheets.map(sh => sheetXml(sh, book));
    const files = [];
    const add = (name, xml) => files.push({ name, data: enc.encode(xml) });
    add("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      "</Types>");
    add("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    const defined = wb.sheets.map((sh, i) => sh.autoFilter
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sh.name).replace(/'/g, "''")}'!${sh.autoFilter.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}</definedName>` : "").join("");
    add("xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets>" + wb.sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets>" +
      (defined ? `<definedNames>${defined}</definedNames>` : "") +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    add("xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    sheets.forEach((xml, i) => add(`xl/worksheets/sheet${i + 1}.xml`, xml));
    add("xl/styles.xml", book.xml()); // 시트를 만든 뒤에 스타일이 모두 등록되므로 마지막에 생성
    return zip(files);
  }

  const XlsxLite = {
    colName, ref, dateSerial, buildBytes,
    build(wb) {
      return new Blob([buildBytes(wb)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    }
  };
  root.XlsxLite = XlsxLite;
  if (typeof module !== "undefined" && module.exports) module.exports = XlsxLite;
})(typeof window !== "undefined" ? window : globalThis);
