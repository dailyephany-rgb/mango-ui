/** Map display username → Auth email (clinical + eng). */
const EMAIL_DOMAIN = "staff.vasundhara-lab.local";

export function usernameToEmail(username) {
  const raw = String(username || "").trim();
  if (!raw) return "";
  const local = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${local}@${EMAIL_DOMAIN}`;
}

export { EMAIL_DOMAIN };
