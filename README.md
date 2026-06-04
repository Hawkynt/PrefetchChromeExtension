# Prefetch Manager

[![License](https://img.shields.io/github/license/Hawkynt/PrefetchChromeExtension)](https://github.com/Hawkynt/PrefetchChromeExtension/blob/main/LICENSE)
[![Language](https://img.shields.io/github/languages/top/Hawkynt/PrefetchChromeExtension?color=8957D5)](https://github.com/Hawkynt/PrefetchChromeExtension)

[![CI](https://github.com/Hawkynt/PrefetchChromeExtension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Hawkynt/PrefetchChromeExtension/actions/workflows/ci.yml)
![Last Commit](https://img.shields.io/github/last-commit/Hawkynt/PrefetchChromeExtension?branch=main)
![Activity](https://img.shields.io/github/commit-activity/m/Hawkynt/PrefetchChromeExtension)

[![Stars](https://img.shields.io/github/stars/Hawkynt/PrefetchChromeExtension?color=FFD700)](https://github.com/Hawkynt/PrefetchChromeExtension/stargazers)
[![Forks](https://img.shields.io/github/forks/Hawkynt/PrefetchChromeExtension?color=008080)](https://github.com/Hawkynt/PrefetchChromeExtension/network/members)
[![Issues](https://img.shields.io/github/issues/Hawkynt/PrefetchChromeExtension)](https://github.com/Hawkynt/PrefetchChromeExtension/issues)
![Code Size](https://img.shields.io/github/languages/code-size/Hawkynt/PrefetchChromeExtension?color=4CAF50)
![Repo Size](https://img.shields.io/github/repo-size/Hawkynt/PrefetchChromeExtension?color=FF9800)

**Prefetch Manager** is a powerful browser extension designed to optimize web browsing by intelligently prefetching resources like pages, scripts, and assets. It enhances browsing speed, reduces latency, and ensures a smoother user experience.

## Features

- **Smart Resource Management**: Dynamically prioritizes resources based on real-time user behavior.
- **Prefetching Methods**:
  - DNS Prefetching
  - Preconnect
  - Preload
  - Module Preload
  - Page Prefetch
- **Interactive UI**: Displays prefetch statistics and current activities in a responsive UI.
- **Mouseover Boosting**: Temporarily elevates priority for links hovered over.
- **Intersection Observer Integration**: Prefetches visible links as they come into the viewport.
- **Customizable Settings**: Easily configure behaviors like scan intervals, prefetch methods, and connection checks.

## Installation

1. **Download or Clone the Repository**:

   ```bash
   git clone https://github.com/yourusername/prefetch-manager.git
   ```

2. **Load the Extension**:
   - Open your browser's extension settings.
   - Enable "Developer Mode."
   - Click "Load Unpacked" and select the extension folder.

3. **Verify Installation**:
   Ensure the extension's icon appears in the browser toolbar.

## How It Works

1. **Resource Prioritization**: Resources are prioritized based on user interaction, such as viewport visibility or hover events.
2. **Queue Management**: The extension manages a priority queue for resources, dynamically updating as user behavior changes.
3. **Prefetch Execution**: Resources are fetched using appropriate methods, depending on browser capabilities and resource type.

## License

This project is licensed under the LGPL License. See the `LICENSE` file for details.
