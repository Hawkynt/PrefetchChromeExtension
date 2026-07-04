import js from "@eslint/js";

// The extension scripts are classic content scripts sharing one global
// scope; names defined in one file (enum.js, settings.js, ...) are used
// in the others, so they are declared as shared globals here.
const SHARED_SCRIPT_GLOBALS = {
  Priority: "readonly",
  State: "readonly",
  Method: "readonly",
  Resource: "readonly",
  PrefetchManager: "readonly",
  PrefetchUI: "readonly",
  settings: "readonly",
  Blacklist: "readonly",
};

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  URL: "readonly",
  IntersectionObserver: "readonly",
  HTMLScriptElement: "readonly",
  localStorage: "readonly",
  chrome: "readonly",
};

export default [
  js.configs.recommended,
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...BROWSER_GLOBALS, ...SHARED_SCRIPT_GLOBALS },
    },
    rules: {
      "no-use-before-define": ["error", { functions: false, classes: false }],
      // The shared globals above ARE these files' own definitions.
      "no-redeclare": ["error", { builtinGlobals: false }],
      "no-unused-vars": [
        "error",
        // Definitions consumed by sibling scripts look unused per-file.
        { varsIgnorePattern: "^(Priority|State|Method|Resource|PrefetchManager|PrefetchUI|settings|Blacklist)$" },
      ],
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-use-before-define": ["error", { functions: false, classes: false }],
    },
  },
  {
    ignores: ["node_modules/", ".github/"],
  },
];
