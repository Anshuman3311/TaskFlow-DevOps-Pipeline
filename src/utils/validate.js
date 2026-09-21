function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const value = email.trim();
  const atIndex = value.indexOf('@');

  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@')) {
    return false;
  }

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (!localPart || !domain) {
    return false;
  }

  const dotIndex = domain.lastIndexOf('.');

  return (
    dotIndex > 0 &&
    dotIndex < domain.length - 1 &&
    !localPart.includes(' ') &&
    !domain.includes(' ')
  );
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
