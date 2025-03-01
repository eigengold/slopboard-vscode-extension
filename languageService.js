const path = require('path');
const apiService = require('./apiService');
const storageService = require('./storageService');

/**
 * Service for language detection and mapping
 */
class LanguageService {
  constructor() {
    this.languages = null;
    this.extensionMap = new Map();
    this.languageIdMap = new Map();
    
    // Initialize default mappings
    this.initDefaultMappings();
  }
  
  /**
   * Initialize default language mappings
   */
  initDefaultMappings() {
    // Default mappings for common languages
    // These will be used as fallbacks if we can't fetch from the API
    const defaultLanguages = [
      { id: 1, name: 'JavaScript', color: '#f7df1e' },
      { id: 2, name: 'TypeScript', color: '#007acc' },
      { id: 3, name: 'Python', color: '#3572A5' },
      { id: 4, name: 'Java', color: '#b07219' },
      { id: 5, name: 'C#', color: '#178600' },
      { id: 6, name: 'C++', color: '#f34b7d' },
      { id: 7, name: 'PHP', color: '#4F5D95' },
      { id: 8, name: 'Ruby', color: '#701516' },
      { id: 9, name: 'Go', color: '#00ADD8' },
      { id: 10, name: 'Rust', color: '#dea584' },
      { id: 11, name: 'HTML', color: '#e34c26' },
      { id: 12, name: 'CSS', color: '#563d7c' },
      { id: 13, name: 'Swift', color: '#ffac45' },
      { id: 14, name: 'Kotlin', color: '#F18E33' },
      { id: 15, name: 'Dart', color: '#00B4AB' }
    ];
    
    // Set up the languages and mappings
    this.setLanguages(defaultLanguages);
  }
  
  /**
   * Configure language mappings
   * @param {Array} languages - Array of language objects
   */
  setLanguages(languages) {
    this.languages = languages;
    this.extensionMap.clear();
    this.languageIdMap.clear();
    
    // Set up extension map
    for (const lang of languages) {
      // Map VS Code language ID to our language object
      // Normalize language name to lowercase for easier matching
      const normalizedName = lang.name.toLowerCase();
      this.languageIdMap.set(normalizedName, lang);
      
      // Map file extensions to language
      const extensions = this.getExtensionsForLanguage(normalizedName);
      for (const ext of extensions) {
        this.extensionMap.set(ext, lang);
      }
    }
  }
  
  /**
   * Get common file extensions for a language
   * @param {string} language - Lowercase language name
   * @returns {Array} - Array of file extensions
   */
  getExtensionsForLanguage(language) {
    // Map of common language names to file extensions
    const extensionMap = {
      'javascript': ['.js', '.mjs', '.cjs'],
      'typescript': ['.ts', '.tsx'],
      'python': ['.py', '.pyw', '.pyx'],
      'java': ['.java'],
      'c#': ['.cs'],
      'c++': ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
      'php': ['.php'],
      'ruby': ['.rb'],
      'go': ['.go'],
      'rust': ['.rs'],
      'html': ['.html', '.htm'],
      'css': ['.css'],
      'swift': ['.swift'],
      'kotlin': ['.kt', '.kts'],
      'dart': ['.dart'],
      // Add more mappings as needed
    };
    
    return extensionMap[language] || [];
  }
  
  /**
   * Initialize by fetching languages from API
   * @returns {Promise} - Resolves when initialization is complete
   */
  async initialize() {
    // First try to get languages from cache
    const cachedLanguages = storageService.getLanguageCache();
    if (cachedLanguages) {
      this.setLanguages(cachedLanguages);
      return;
    }
    
    // If not cached, try to fetch from API
    try {
      const languages = await apiService.getLanguages();
      if (languages && languages.length > 0) {
        this.setLanguages(languages);
        storageService.cacheLanguages(languages);
      }
    } catch (error) {
      console.error('Failed to fetch languages from API:', error);
      // Default languages will be used
    }
  }
  
  /**
   * Detect language from file path or VS Code language ID
   * @param {string} filePath - Path to the file
   * @param {string} languageId - VS Code language ID
   * @returns {Object} - Language object
   */
  detectLanguage(filePath, languageId) {
    // First try to match by VS Code language ID
    if (languageId) {
      const lang = this.languageIdMap.get(languageId.toLowerCase());
      if (lang) {
        return lang;
      }
    }
    
    // Then try to match by file extension
    if (filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const lang = this.extensionMap.get(ext);
      if (lang) {
        return lang;
      }
    }
    
    // Return unknown language if no match
    return { id: 0, name: languageId || 'Unknown', color: '#cccccc' };
  }
  
  /**
   * Get all known languages
   * @returns {Array} - Array of language objects
   */
  getAllLanguages() {
    return this.languages || [];
  }
  
  /**
   * Get language by ID
   * @param {number} id - Language ID
   * @returns {Object|null} - Language object or null if not found
   */
  getLanguageById(id) {
    return this.languages.find(lang => lang.id === id) || null;
  }
}

module.exports = new LanguageService();