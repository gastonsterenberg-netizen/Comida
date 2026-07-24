const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src', 'app', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

const replacements = [
  { search: /\bbg-white(?! dark:)/g, replace: 'bg-white dark:bg-gray-800' },
  { search: /\btext-gray-900(?! dark:)/g, replace: 'text-gray-900 dark:text-gray-100' },
  { search: /\btext-gray-800(?! dark:)/g, replace: 'text-gray-800 dark:text-gray-200' },
  { search: /\btext-gray-700(?! dark:)/g, replace: 'text-gray-700 dark:text-gray-300' },
  { search: /\btext-gray-500(?! dark:)/g, replace: 'text-gray-500 dark:text-gray-400' },
  { search: /\bbg-gray-50(?!\/| dark:)/g, replace: 'bg-gray-50 dark:bg-gray-900' },
  { search: /\bbg-gray-50\/50(?! dark:)/g, replace: 'bg-gray-50/50 dark:bg-gray-900/50' },
  { search: /\bbg-gray-50\/30(?! dark:)/g, replace: 'bg-gray-50/30 dark:bg-gray-900/30' },
  { search: /\bborder-gray-200(?! dark:)/g, replace: 'border-gray-200 dark:border-gray-700' },
  { search: /\bbg-gray-100(?! dark:)/g, replace: 'bg-gray-100 dark:bg-gray-700' },
  { search: /\bborder-gray-300(?! dark:)/g, replace: 'border-gray-300 dark:border-gray-600' },
  { search: /\bdivide-gray-200(?! dark:)/g, replace: 'divide-gray-200 dark:divide-gray-700' },
];

replacements.forEach(({ search, replace }) => {
  content = content.replace(search, replace);
});

fs.writeFileSync(pagePath, content, 'utf8');
console.log('Dark mode classes injected successfully.');
