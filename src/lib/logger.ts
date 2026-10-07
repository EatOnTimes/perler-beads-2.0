
type LogDetail = unknown;

function writeLog(
  method: "log" | "warn" | "error",
  message: string,
  detail?: LogDetail,
  extra?: LogDetail,
) {
  if (typeof console === "undefined") return;
  const args: unknown[] = [message];
  if (detail) args.push(detail);
  if (extra !== undefined) args.push(extra);
  console[method](...args);
}

export const logger = {
  info: (message: string, detail?: LogDetail) => writeLog("log", message, detail),
  warn: (message: string, detail?: LogDetail) => writeLog("warn", message, detail),
  error: (message: string, errorOrDetail?: LogDetail, extra?: LogDetail) => {
    if (errorOrDetail instanceof Error || typeof errorOrDetail === "string") {
      writeLog("error", message, extra, errorOrDetail);
    } else {
      writeLog("error", message, errorOrDetail);
    }
  },
};

export default logger;
