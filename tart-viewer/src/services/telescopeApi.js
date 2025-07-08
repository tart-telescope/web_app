import axios from 'axios';

class TelescopeApiService {
  constructor() {
    this.client = null;
    this.baseURL = null;
    this.apiPrefix = '';
    this.token = null;
    this.defaultTimeout = 10_000;
    this.abortController = null;
  }

  /**
   * Set the telescope base URL
   * @param {string} url - The telescope base URL
   */
  setUrl(url) {
    if (this.baseURL !== url) {
      // Only cancel requests if we've been using the old URL for a while
      // This prevents canceling requests during initial app load/routing
      if (this.baseURL && this._shouldCancelRequests()) {
        this._cancelPendingRequests();
      }
      this.baseURL = url;
      this._recreateClient();
    }
  }

  /**
   * Set the API prefix
   * @param {string} prefix - API prefix (usually empty string or "/api/v1")
   */
  setApiPrefix(prefix = '') {
    if (this.apiPrefix !== prefix) {
      this.apiPrefix = prefix;
      this._recreateClient();
    }
  }

  /**
   * Set the authentication token
   * @param {string} token - JWT token
   */
  setToken(token) {
    if (this.token !== token) {
      this.token = token;
      if (this.client) {
        if (token) {
          this.client.defaults.headers.Authorization = `JWT ${token}`;
        } else {
          delete this.client.defaults.headers.Authorization;
        }
      }
    }
  }

  /**
   * Clear the authentication token
   */
  clearToken() {
    this.setToken(null);
  }

  /**
   * Reset the service completely
   */
  reset() {
    this._cancelPendingRequests();
    this.client = null;
    this.baseURL = null;
    this.apiPrefix = '';
    this.token = null;
  }

  /**
   * Get the current client, creating it if necessary
   * @returns {Object} Configured axios instance
   */
  _getClient() {
    if (!this.client && this.baseURL) {
      this._recreateClient();
    }
    if (!this.client) {
      throw new Error('Telescope service not configured. Call setUrl() first.');
    }
    return this.client;
  }

  /**
   * Recreate the axios client with current configuration
   * @private
   */
  _recreateClient() {
    if (!this.baseURL) {
      this.client = null;
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `JWT ${this.token}`;
    }

    this.client = axios.create({
      baseURL: this.baseURL + this.apiPrefix,
      timeout: this.defaultTimeout,
      headers,
    });

    // Create new abort controller for this client
    this._createAbortController();
    
    // Track when we created this client
    this.clientCreatedAt = Date.now();
  }

  /**
   * Create a new AbortController for request cancellation
   * @private
   */
  _createAbortController() {
    this.abortController = new AbortController();
  }

  /**
   * Check if we should cancel pending requests when switching URLs
   * Only cancel if the current client has been active for more than 2 seconds
   * @private
   */
  _shouldCancelRequests() {
    if (!this.clientCreatedAt) {return false;}
    const timeSinceCreation = Date.now() - this.clientCreatedAt;
    return timeSinceCreation > 2000; // 2 second grace period
  }

  /**
   * Cancel all pending requests
   * @private
   */
  _cancelPendingRequests() {
    if (this.abortController) {
      this.abortController.abort();
      this._createAbortController();
    }
  }

  /**
   * Get request config with abort signal
   * @private
   */
  _getRequestConfig() {
    return {
      signal: this.abortController?.signal
    };
  }

  /**
   * Handle async operations with centralized error handling
   * @private
   */
  async _handleRequest(operation, context = 'API request') {
    try {
      return await operation();
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`${context} was cancelled`);
        return null;
      }
      console.error(`${context} failed:`, error);
      return null;
    }
  }

  /**
   * Authenticate with the telescope
   * @param {string} password - Admin password
   * @returns {Promise} Promise that resolves to auth response
   */
  async authenticate(password) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const requestConfig = this._getRequestConfig();
      const response = await client.post('/auth', {
        username: 'admin',
        password
      }, requestConfig);
      
      // Automatically set the token
      this.setToken(response.data.access_token);
      
      return response.data;
    }, 'Authentication');
  }

  /**
   * Get telescope info
   * @returns {Promise} Promise that resolves to telescope info
   */
  async getInfo() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/info', this._getRequestConfig());
      return response.data;
    }, 'Get telescope info');
  }

  /**
   * Get current telescope mode
   * @returns {Promise} Promise that resolves to current mode
   */
  async getCurrentMode() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/mode/current', this._getRequestConfig());
      return response.data;
    }, 'Get current mode');
  }

  /**
   * Set telescope mode
   * @param {string} mode - New mode to set
   * @returns {Promise} Promise that resolves to mode response
   */
  async setMode(mode) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.post(`/mode/${mode}`, {}, this._getRequestConfig());
      return response.data;
    }, `Set mode to ${mode}`);
  }

  /**
   * Get visibility data list
   * @returns {Promise} Promise that resolves to vis data list
   */
  async getVisDataList() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/vis/data', this._getRequestConfig());
      return response.data;
    }, 'Get vis data list');
  }

  /**
   * Create new visibility data
   * @returns {Promise} Promise that resolves to new vis data
   */
  async createVisData() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.post('/vis/data', {}, this._getRequestConfig());
      return response.data;
    }, 'Create vis data');
  }

  /**
   * Get raw data list
   * @returns {Promise} Promise that resolves to raw data list
   */
  async getRawDataList() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/raw/data', this._getRequestConfig());
      return response.data;
    }, 'Get raw data list');
  }

  /**
   * Create new raw data
   * @returns {Promise} Promise that resolves to new raw data
   */
  async createRawData() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.post('/raw/data', {}, this._getRequestConfig());
      return response.data;
    }, 'Create raw data');
  }

  /**
   * Get channel status
   * @returns {Promise} Promise that resolves to channel status
   */
  async getChannelStatus() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/status/channel', this._getRequestConfig());
      return response.data;
    }, 'Get channel status');
  }

  /**
   * Get antenna positions
   * @returns {Promise} Promise that resolves to antenna positions
   */
  async getAntennaPositions() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/imaging/antenna_positions', this._getRequestConfig());
      return response.data;
    }, 'Get antenna positions');
  }

  /**
   * Get visibility data for imaging
   * @returns {Promise} Promise that resolves to visibility data
   */
  async getImagingVis() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/imaging/vis', this._getRequestConfig());
      return response.data;
    }, 'Get imaging vis data');
  }

  /**
   * Get calibration gain data
   * @returns {Promise} Promise that resolves to gain data
   */
  async getGain() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/calibration/gain', this._getRequestConfig());
      return response.data;
    }, 'Get gain data');
  }

  /**
   * Get synthesis data (combines vis, gain, and antenna positions)
   * @returns {Promise} Promise that resolves to synthesis data object
   */
  async getSynthesisData() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const requestConfig = this._getRequestConfig();
      const [visResponse, gainResponse, antennaResponse] = await Promise.all([
        client.get('/imaging/vis', requestConfig),
        client.get('/calibration/gain', requestConfig),
        client.get('/imaging/antenna_positions', requestConfig),
      ]);

      return {
        vis: visResponse.data,
        gain: gainResponse.data,
        antennas: antennaResponse.data,
      };
    }, 'Get synthesis data');
  }

  /**
   * Get raw data save flag
   * @returns {Promise} Promise that resolves to save flag status
   */
  async getRawSaveFlag() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/acquire/raw/save', this._getRequestConfig());
      return response.data;
    }, 'Get raw save flag');
  }

  /**
   * Set raw data save flag
   * @param {number} flag - Save flag (0 or 1)
   * @returns {Promise} Promise that resolves to save flag response
   */
  async setRawSaveFlag(flag) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.put(`/acquire/raw/save/${flag}`, {}, this._getRequestConfig());
      return response.data;
    }, `Set raw save flag to ${flag}`);
  }

  /**
   * Get visibility data save flag
   * @returns {Promise} Promise that resolves to save flag status
   */
  async getVisSaveFlag() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/acquire/vis/save', this._getRequestConfig());
      return response.data;
    }, 'Get vis save flag');
  }

  /**
   * Set visibility data save flag
   * @param {number} flag - Save flag (0 or 1)
   * @returns {Promise} Promise that resolves to save flag response
   */
  async setVisSaveFlag(flag) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.put(`/acquire/vis/save/${flag}`, {}, this._getRequestConfig());
      return response.data;
    }, `Set vis save flag to ${flag}`);
  }

  /**
   * Get raw data number of samples exponent
   * @returns {Promise} Promise that resolves to samples exponent
   */
  async getRawNumSamplesExp() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/acquire/raw/num_samples_exp', this._getRequestConfig());
      return response.data;
    }, 'Get raw num samples exp');
  }

  /**
   * Set raw data number of samples exponent
   * @param {number} exp - Exponent for number of samples (16-24)
   * @returns {Promise} Promise that resolves to samples exponent response
   */
  async setRawNumSamplesExp(exp) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.put(`/acquire/raw/num_samples_exp/${exp}`, {}, this._getRequestConfig());
      return response.data;
    }, `Set raw num samples exp to ${exp}`);
  }

  /**
   * Get visibility data number of samples exponent
   * @returns {Promise} Promise that resolves to samples exponent
   */
  async getVisNumSamplesExp() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/acquire/vis/num_samples_exp', this._getRequestConfig());
      return response.data;
    }, 'Get vis num samples exp');
  }

  /**
   * Set visibility data number of samples exponent
   * @param {number} exp - Exponent for number of samples (16-24)
   * @returns {Promise} Promise that resolves to samples exponent response
   */
  async setVisNumSamplesExp(exp) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.put(`/acquire/vis/num_samples_exp/${exp}`, {}, this._getRequestConfig());
      return response.data;
    }, `Set vis num samples exp to ${exp}`);
  }
}

// Export a singleton instance
export default new TelescopeApiService();