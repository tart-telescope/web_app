class S3Service {
  constructor() {
    this.S3_BUCKET = "tart-hdf";
    this.S3_HOST = "s3.max.ac.nz";
    this.abortController = null;
  }

  /**
   * Set S3 configuration
   * @param {string} bucket - S3 bucket name
   * @param {string} host - S3 host/endpoint
   */
  setConfig(bucket, host) {
    this.S3_BUCKET = bucket;
    this.S3_HOST = host;
  }

  /**
   * Create a new AbortController for request cancellation
   * @private
   */
  _createAbortController() {
    this.abortController = new AbortController();
  }

  /**
   * Cancel all pending requests
   */
  cancelPendingRequests() {
    if (this.abortController) {
      this.abortController.abort();
      this._createAbortController();
    }
  }

  /**
   * Handle async operations with centralized error handling
   * @private
   */
  async _handleRequest(operation, context = 'S3 request') {
    try {
      return await operation();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`${context} was cancelled`);
        return null;
      }
      console.error(`${context} failed:`, error);
      throw error;
    }
  }

  /**
   * Generate date prefix for S3 path
   * @param {Date} date - Date object
   * @param {string} basePath - Base path to extract telescope from
   * @returns {string} Generated S3 prefix
   */
  generateDatePrefix(date, basePath = '') {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    // Extract telescope from basePath or use default
    const basePathPart = basePath
      .split("/")
      .find((part) => part.length > 0);
    const telescope = basePathPart || "zm-cbu";

    return `${telescope}/vis/${year}/${month}/${day}/`;
  }

  /**
   * Parse S3 XML response to extract file information
   * @param {string} xmlText - Raw XML response from S3
   * @param {string} prefix - S3 prefix used in the request
   * @returns {Array} Array of file objects
   */
  parseS3ResponseForFiles(xmlText, prefix) {
    const files = [];

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // Parse files (Contents elements)
      const contents = xmlDoc.querySelectorAll("Contents");
      for (const content of contents) {
        const key = content.querySelectorAll("Key")[0]?.textContent;
        const size = content.querySelectorAll("Size")[0]?.textContent;
        const lastModified =
          content.querySelectorAll("LastModified")[0]?.textContent;

        if (key) {
          const fileName = key.replace(prefix, "");
          if (fileName && !fileName.includes("/")) {
            files.push({
              name: fileName,
              size: Number.parseInt(size) || 0,
              lastModified: lastModified ? new Date(lastModified) : null,
              fullPath: key, // Keep full path for URL generation
            });
          }
        }
      }
      return files;
    } catch (error) {
      console.error("Error parsing S3 XML response:", error);
      return [];
    }
  }

  /**
   * Fetch files for a single day from S3
   * @param {string} prefix - S3 prefix to fetch
   * @returns {Promise<Array>} Promise that resolves to array of file objects
   */
  async fetchSingleDay(prefix) {
    return await this._handleRequest(async () => {
      const params = new URLSearchParams({
        "list-type": "2",
        delimiter: "/",
        prefix,
      });

      const url = `https://${this.S3_HOST}/${this.S3_BUCKET}?${params}`;
      
      const requestConfig = {};
      if (this.abortController) {
        requestConfig.signal = this.abortController.signal;
      }

      const response = await fetch(url, requestConfig);
      if (!response.ok) {
        console.warn(`Failed to fetch ${prefix}: HTTP ${response.status}`);
        return [];
      }

      const xmlText = await response.text();
      return this.parseS3ResponseForFiles(xmlText, prefix);
    }, `Fetch single day: ${prefix}`);
  }

  /**
   * Fetch files from the last 24 hours across multiple days
   * @param {string} basePath - Base path for telescope
   * @param {number} dataThinning - Data thinning factor (default: 1)
   * @param {number} minDesiredFiles - Minimum number of files to fetch (default: 50)
   * @returns {Promise<Object>} Promise that resolves to object with files and metadata
   */
  async fetchLast24Hours(basePath = '', dataThinning = 1, minDesiredFiles = 50) {
    return await this._handleRequest(async () => {
      // Create new abort controller for this operation
      this._createAbortController();

      // Calculate date prefixes
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const today = new Date();
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrowPrefix = this.generateDatePrefix(tomorrow, basePath);
      const todayPrefix = this.generateDatePrefix(today, basePath);
      const yesterdayPrefix = this.generateDatePrefix(yesterday, basePath);

      // Fetch files from multiple days
      const tomorrowFiles = await this.fetchSingleDay(tomorrowPrefix);
      const todayFiles = await this.fetchSingleDay(todayPrefix);
      
      let yesterdayFiles = [];
      if (todayFiles && todayFiles.length < minDesiredFiles) {
        yesterdayFiles = await this.fetchSingleDay(yesterdayPrefix);
      }

      // Handle null responses (cancelled requests)
      const allFiles = [
        ...(tomorrowFiles || []),
        ...(todayFiles || []),
        ...(yesterdayFiles || []),
      ];

      // Sort by lastModified date (newest first)
      allFiles.sort((a, b) => {
        if (!a.lastModified && !b.lastModified) {
return 0;
}
        if (!a.lastModified) {
return 1;
}
        if (!b.lastModified) {
return -1;
}
        return new Date(b.lastModified) - new Date(a.lastModified);
      });

      // Apply data thinning
      let thinnedFiles = allFiles;
      if (dataThinning > 1) {
        thinnedFiles = allFiles.filter((_, index) => index % dataThinning === 0);
      }

      // Limit to desired number of files
      const files = thinnedFiles.slice(0, minDesiredFiles);

      return {
        files,
        allFiles,
        totalFiles: thinnedFiles.length
      };
    }, 'Fetch last 24 hours');
  }

  /**
   * Generate file URL for a given file
   * @param {string} fileName - Name of the file
   * @param {Array} allFiles - Array of all files to search in
   * @param {string} fallbackPrefix - Fallback prefix if file not found in allFiles
   * @returns {string} Complete URL to the file
   */
  getFileUrl(fileName, allFiles = [], fallbackPrefix = '') {
    // Find the file in allFiles to get its full path
    const file = allFiles.find((f) => f.name === fileName);
    if (file && file.fullPath) {
      return `https://${this.S3_HOST}/${this.S3_BUCKET}/${file.fullPath}`;
    }
    // Fallback to provided prefix
    return `https://${this.S3_HOST}/${this.S3_BUCKET}/${fallbackPrefix}${fileName}`;
  }

  /**
   * Fetch files with a specific prefix
   * @param {string} prefix - S3 prefix to list
   * @param {string} delimiter - Delimiter for prefix listing (default: "/")
   * @returns {Promise<Object>} Promise that resolves to object with files and folders
   */
  async fetchWithPrefix(prefix, delimiter = "/") {
    return await this._handleRequest(async () => {
      this._createAbortController();

      const params = new URLSearchParams({
        "list-type": "2",
        delimiter,
        prefix,
      });

      const url = `https://${this.S3_HOST}/${this.S3_BUCKET}?${params}`;
      
      const requestConfig = {};
      if (this.abortController) {
        requestConfig.signal = this.abortController.signal;
      }

      const response = await fetch(url, requestConfig);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      
      // Parse both files and folders
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      const files = this.parseS3ResponseForFiles(xmlText, prefix);
      
      // Parse folders (CommonPrefixes elements)
      const folders = [];
      const commonPrefixes = xmlDoc.querySelectorAll("CommonPrefixes");
      for (const commonPrefix of commonPrefixes) {
        const prefixElement = commonPrefix.querySelectorAll("Prefix")[0];
        if (prefixElement && prefixElement.textContent) {
          const folderName = prefixElement.textContent.replace(prefix, "").replace("/", "");
          if (folderName) {
            folders.push(folderName);
          }
        }
      }

      return {files, folders};
    }, `Fetch with prefix: ${prefix}`);
  }
}

// Export a singleton instance
export default new S3Service();