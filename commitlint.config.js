module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    // Ignore semantic-release commits
    (message) => message.includes('[skip ci]') && message.includes('chore(release):')
  ]
};
