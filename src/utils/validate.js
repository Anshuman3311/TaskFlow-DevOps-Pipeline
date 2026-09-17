const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

function isPositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') {return '';}
  const trimmed = value.trim();
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

module.exports = { isValidEmail, isPositiveInteger, cleanString };
