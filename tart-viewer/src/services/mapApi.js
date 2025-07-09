import axios from 'axios';

class MapApiService {
  constructor() {
    this.client = null;
    this.baseURL = 'https://map.elec.ac.nz/api/v1';
    this.defaultTimeout = 10_000;
    this.abortController = null;
    this._recreateClient();
  }

  /**
   * Reset the service completely
   */
  reset() {
    this._cancelPendingRequests();
    this.client = null;
  }

  /**
   * Get the current client
   * @returns {Object} Configured axios instance
   */
  _getClient() {
    if (!this.client) {
      this._recreateClient();
    }
    return this.client;
  }

  /**
   * Recreate the axios client with current configuration
   * @private
   */
  _recreateClient() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Create new abort controller for this client
    this._createAbortController();
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
  async _handleRequest(operation, context = 'Map API request') {
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
   * Get all telescopes from the map API
   * @returns {Promise} Promise that resolves to telescope data
   */
  async getTelescopes() {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/telescopes', this._getRequestConfig());
      return response.data;
    }, 'Get telescopes');
  }

  /**
   * Get a specific telescope by ID
   * @param {string|number} telescopeId - The telescope ID
   * @returns {Promise} Promise that resolves to telescope data
   */
  async getTelescope(telescopeId) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get(`/telescopes/${telescopeId}`, this._getRequestConfig());
      return response.data;
    }, `Get telescope ${telescopeId}`);
  }
}

// Export a singleton instance
export default new MapApiService();