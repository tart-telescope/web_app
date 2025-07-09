import axios from 'axios';

class SatelliteApiService {
  constructor() {
    this.client = null;
    this.baseURL = null;
    this.defaultTimeout = 10_000;
    this.abortController = null;
  }

  /**
   * Set the satellite catalog base URL
   * @param {string} url - The satellite catalog base URL
   */
  setUrl(url) {
    if (this.baseURL !== url) {
      this._cancelPendingRequests();
      this.baseURL = url;
      this._recreateClient();
    }
  }

  /**
   * Reset the service completely
   */
  reset() {
    this._cancelPendingRequests();
    this.client = null;
    this.baseURL = null;
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
      throw new Error('Satellite API service not configured. Call setUrl() first.');
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
  async _handleRequest(operation, context = 'Satellite API request') {
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
   * Get satellite catalog data for a specific date and location
   * @param {string} date - Date/timestamp for the catalog query
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} alt - Altitude (optional, defaults to 0)
   * @returns {Promise} Promise that resolves to satellite catalog data
   */
  async getCatalog(date, lat, lon, alt = 0) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.get('/catalog', {
        params: { date, lat, lon, alt },
        ...this._getRequestConfig()
      });
      return response.data;
    }, 'Get satellite catalog');
  }

  /**
   * Get bulk satellite data for multiple timestamps
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} alt - Altitude (optional, defaults to 0)
   * @param {Array} dates - Array of timestamps/dates
   * @returns {Promise} Promise that resolves to bulk satellite data
   */
  async getBulkAzEl(lat, lon, alt = 0, dates) {
    return await this._handleRequest(async () => {
      const client = this._getClient();
      const response = await client.post('/bulk_az_el', {
        lat,
        lon,
        alt,
        dates
      }, this._getRequestConfig());
      return response.data;
    }, 'Get bulk satellite data');
  }
}

// Export a singleton instance
export default new SatelliteApiService();