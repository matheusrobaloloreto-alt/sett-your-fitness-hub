import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function loadPure(url) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(url, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports },
  );
  return exports;
}
const identity = loadPure(
  new URL("../_shared/whatsappIdentity.ts", import.meta.url),
);
const source = fs.readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile(
  "webhook.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const fn = parsed.statements.find((n) =>
  ts.isFunctionDeclaration(n) && n.name?.text === "autoLinkCanonicalStudent"
);
let autoLink;
if (fn) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fn.getText(parsed), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, ...identity },
  );
  autoLink = exports.autoLinkCanonicalStudent;
}
async function run(
  {
    mode = "live",
    ambiguous = false,
    missingAck = false,
    error = false,
    duplicate = false,
    foreign = false,
    country = "US",
    lateDuplicate = false,
  } = {},
) {
  const companyId = "synthetic-company",
    remoteJid = country === "BR"
      ? "5548998765432@s.whatsapp.net"
      : "12025550123@s.whatsapp.net";
  const chat = {
    id: "synthetic-chat",
    remote_jid: remoteJid,
    student_id: null,
    contact_name: null,
    last_message_at: null,
  };
  const student = {
    id: "synthetic-student",
    company_id: foreign ? "other-company" : companyId,
    phone: ambiguous
      ? "+12025550199"
      : country === "BR"
      ? "4898765432"
      : "+12025550123",
    whatsapp: country === "BR" ? "48998765432" : "+12025550123",
    country_code: country,
  };
  const writes = [], filters = [];
  const client = {
    from: (table) => {
      let update = false;
      let offset = 0;
      const q = {
        select: () => q,
        order: () => q,
        range: (start) => {
          offset = start;
          return q;
        },
        eq: (...args) => {
          filters.push(args);
          return q;
        },
        is: (...args) => {
          filters.push(args);
          return q;
        },
        update: (value) => {
          update = true;
          writes.push(value);
          return q;
        },
        maybeSingle: async () => ({
          data: missingAck ? null : {
            id: chat.id,
            student_id: student.id,
            remote_jid: chat.remote_jid,
          },
          error: error ? {} : null,
        }),
        then: (resolve) =>
          Promise.resolve(
            update ? { data: null, error: error ? {} : null } : {
              data: lateDuplicate
                ? offset === 0
                  ? [
                    student,
                    ...Array.from(
                      { length: 499 },
                      (_, i) => ({
                        ...student,
                        id: `filler-${i}`,
                        phone: "+12025550199",
                        whatsapp: "+12025550199",
                      }),
                    ),
                  ]
                  : [{ ...student, id: "another-student" }]
                : duplicate
                ? [student, { ...student, id: "another-student" }]
                : [student],
              error: null,
            },
          ).then(resolve),
      };
      return q;
    },
  };
  if (autoLink) {
    const id = await autoLink({
      adminClient: client,
      companyId,
      instanceId: "synthetic-instance",
      chat,
      remoteJid,
    });
    if (id) chat.student_id = id;
  } else {
    let snippet;
    if (mode === "live") {
      const a = source.indexOf("        let isStudent = !!chat.student_id;");
      snippet = source.slice(a, source.indexOf("        // Deduplicate", a));
    } else {
      const a = source.indexOf(
        "        const phoneKey = normalizeWhatsAppPhoneKey(remoteJid);",
      );
      snippet = source.slice(a, source.indexOf("        if (msgExtId)", a));
    }
    const javascript = ts.transpileModule(
      `async function run(){${snippet};return chat.student_id;}run();`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    await vm.runInNewContext(javascript, {
      chat,
      adminClient: client,
      instance: { id: "synthetic-instance", company_id: companyId },
      remoteJid,
      ...identity,
      console: { log() {} },
    });
  }
  return { chat, writes, filters, remoteJid };
}
for (const mode of ["live", "history"]) {
  test(`${mode}: divergent legacy fields never autolink`, async () => {
    const r = await run({ mode, ambiguous: true });
    assert.equal(r.chat.student_id, null);
    assert.equal(r.writes.length, 0);
  });
  test(`${mode}: failed/zero-row link ACK cannot claim student locally`, async () => {
    for (const args of [{ error: true }, { missingAck: true }]) {
      const r = await run({ mode, ...args });
      assert.equal(r.chat.student_id, null);
    }
  });
  test(`${mode}: canonical equivalent phone links only student_id, preserves historical JID`, async () => {
    const r = await run({ mode, country: "BR" });
    assert.equal(r.chat.student_id, "synthetic-student");
    assert.equal(
      JSON.stringify(r.writes),
      JSON.stringify([{ student_id: "synthetic-student" }]),
    );
    assert.equal(r.chat.remote_jid, r.remoteJid);
  });
  test(`${mode}: ambiguous ownership and foreign tenant cannot link`, async () => {
    for (const args of [{ duplicate: true }, { foreign: true }]) {
      const r = await run({ mode, ...args });
      assert.equal(r.chat.student_id, null);
      assert.equal(r.writes.length, 0);
    }
  });
}

test("complete tenant paging rejects a duplicate canonical owner beyond first page", async () => {
  const r = await run({ lateDuplicate: true });
  assert.equal(r.chat.student_id, null);
  assert.equal(r.writes.length, 0);
});
