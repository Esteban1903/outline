/**
 * Verifica el Quality Gate de SonarCloud sin depender del plugin Jenkins.
 * Lee el task ID del archivo .scannerwork/report-task.txt generado por el scanner,
 * espera a que el análisis termine y verifica el estado del Quality Gate.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROJECT_KEY = "esteban1903_outline-hu01";
const SONAR_URL = "https://sonarcloud.io";

function getToken() {
  // Prefer Jenkins credential, fall back to sonar-project.properties
  if (process.env.SONAR_TOKEN) return process.env.SONAR_TOKEN;
  try {
    const props = fs.readFileSync(
      path.join(process.cwd(), "sonar-project.properties"),
      "utf8"
    );
    const match = props.match(/^sonar\.token=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  return "";
}

function readTaskFile() {
  const taskFile = path.join(
    process.cwd(),
    ".scannerwork",
    "report-task.txt"
  );
  if (!fs.existsSync(taskFile)) return null;
  const map = {};
  for (const line of fs.readFileSync(taskFile, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return map;
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(token + ":").toString("base64");
    const req = https.get(
      url,
      { headers: { Authorization: "Basic " + auth } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("JSON parse failed: " + data.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error("No SONAR_TOKEN found — skipping Quality Gate check");
    process.exit(0);
  }

  const task = readTaskFile();
  if (!task || !task["ceTaskId"]) {
    console.log(
      ".scannerwork/report-task.txt not found — checking gate by project key"
    );
  }

  const ceTaskId = task && task["ceTaskId"];
  const projectKey = (task && task["projectKey"]) || PROJECT_KEY;

  if (ceTaskId) {
    console.log("Waiting for SonarCloud analysis task:", ceTaskId);
    for (let i = 0; i < 30; i++) {
      await sleep(10000);
      let result;
      try {
        result = await get(
          `${SONAR_URL}/api/ce/task?id=${ceTaskId}`,
          token
        );
      } catch (e) {
        console.error("API error:", e.message);
        continue;
      }
      const status = result.task && result.task.status;
      console.log(`  Attempt ${i + 1}: task status = ${status}`);
      if (status === "SUCCESS") break;
      if (status === "FAILED" || status === "CANCELLED") {
        console.error("Analysis task ended with status:", status);
        process.exit(1);
      }
    }
  } else {
    await sleep(15000);
  }

  console.log("Checking Quality Gate for project:", projectKey);
  const qgResult = await get(
    `${SONAR_URL}/api/qualitygates/project_status?projectKey=${projectKey}`,
    token
  );

  const qgStatus = qgResult.projectStatus && qgResult.projectStatus.status;
  console.log("Quality Gate status:", qgStatus);

  if (qgStatus === "OK" || qgStatus === "NONE") {
    console.log("Quality Gate PASSED");
    process.exit(0);
  } else {
    console.error("Quality Gate FAILED:", qgStatus);
    const conditions =
      qgResult.projectStatus && qgResult.projectStatus.conditions;
    if (conditions) {
      for (const c of conditions.filter((c) => c.status === "ERROR")) {
        console.error(`  ${c.metricKey}: ${c.actualValue} (threshold: ${c.errorThreshold})`);
      }
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unexpected error:", e.message);
  process.exit(1);
});
