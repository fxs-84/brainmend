// 通过 GitHub Git Data API 推送本地 HEAD (github.com:443 被墙时的备用通道, 走 api.github.com)
// 以远端 main 为父提交, 内容取自本地 commit 对象 → 远端 tree 与本地完全一致
import { execSync } from "node:child_process";

const REPO = "fxs-84/brainmend";
const BRANCH = "main";

const credOut = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill').toString();
const TOKEN = credOut.match(/^password=(.+)$/m)?.[1].trim();
if (!TOKEN) { console.error("no token"); process.exit(1); }

const localHead = execSync("git rev-parse HEAD").toString().trim();
const MESSAGE = execSync("git log -1 --pretty=%B HEAD").toString().trim();
const FILES = execSync("git diff-tree --no-commit-id --name-only -r HEAD").toString().trim().split("\n").filter(Boolean);
console.log("local HEAD:", localHead.slice(0, 7), "files:", FILES.length);

const api = async (path, opts = {}) => {
  const r = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "brainmend-deploy",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${path} → ${r.status}: ${j.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
};

// 1. 远端 main 当前指向 (作为父提交)
const ref = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
const baseSha = ref.object.sha;
console.log("remote base:", baseSha.slice(0, 7));

// 2. blobs: 内容取自本地 commit (git show), 保证 tree 一致
const tree = [];
for (const f of FILES) {
  const content = execSync(`git show HEAD:"${f}"`);
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
  });
  const localBlob = execSync(`git rev-parse HEAD:"${f}"`).toString().trim();
  console.log("blob:", f, blob.sha.slice(0, 8), blob.sha === localBlob ? "match" : `DIFF (local ${localBlob.slice(0, 8)})`);
  tree.push({ path: f, mode: "100644", type: "blob", sha: blob.sha });
}

// 3. tree / 4. commit / 5. 更新 ref
const baseCommit = await api(`/repos/${REPO}/git/commits/${baseSha}`);
const newTree = await api(`/repos/${REPO}/git/trees`, {
  method: "POST",
  body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
});
const localTree = execSync("git rev-parse \"HEAD^{tree}\"").toString().trim();
console.log("tree:", newTree.sha.slice(0, 8), newTree.sha === localTree ? "== local" : `!= local ${localTree.slice(0, 8)}`);

const newCommit = await api(`/repos/${REPO}/git/commits`, {
  method: "POST",
  body: JSON.stringify({ message: MESSAGE, tree: newTree.sha, parents: [baseSha] }),
});
await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
  method: "PATCH",
  body: JSON.stringify({ sha: newCommit.sha }),
});
console.log("✓ main →", newCommit.sha.slice(0, 7));
