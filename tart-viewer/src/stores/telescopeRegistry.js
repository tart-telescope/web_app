import { defineStore } from 'pinia'
import { mapApi } from '@/services'

export const useTelescopeRegistryStore = defineStore('telescopeRegistry', {
  state: () => ({
    telescopes: new Map(),
    validTelescopeIds: new Set(['custom', 'local']), // Always include custom and local
    lastUpdated: null,
    isLoading: false,
    pollInterval: null,
    localMode: false
  }),

  getters: {
    /**
     * Get list of telescopes for UI display
     */
    telescopeList: (state) => {
      let telescopes = []
      
      // In local mode, only show local telescope
      if (state.localMode) {
        telescopes = [{ title: 'Local', value: 'local', online: true }]
      } else {
        // Normal mode: show all fetched telescopes
        telescopes = Array.from(state.telescopes.values())
          .map(telescope => ({
            title: telescope.telescopeName || telescope.hostname || telescope.nodeName,
            value: telescope.hostname,
            online: telescope.online || false,
            lastSeen: telescope.lastSeen,
            currentMode: telescope.currentMode,
            fallback: telescope.fallback || false
          }))
          .sort((a, b) => {
            // Sort by online status first, then alphabetically
            if (a.online !== b.online) {
              return b.online - a.online
            }
            return a.title.localeCompare(b.title)
          })

        // Add custom option at the end
        telescopes.push({ title: 'Custom', value: 'custom' })
      }

      return telescopes
    },

    /**
     * Check if data is stale and needs refresh
     */
    isDataStale: (state) => (maxAge = 5 * 60 * 1000) => {
      if (!state.lastUpdated) {return true}
      return Date.now() - state.lastUpdated > maxAge
    },



    /**
     * Get telescope data by ID
     */
    getTelescope: (state) => (telescopeId) => {
      return state.telescopes.get(telescopeId) || null
    }
  },

  actions: {
    /**
     * Initialize store
     */
    initialize() {
      // Just ensure custom and local are in validTelescopeIds
      this.validTelescopeIds.add('custom')
      this.validTelescopeIds.add('local')
    },

    /**
     * Fetch telescope data from API
     */
    async fetchTelescopes() {
      if (this.isLoading) {
        return false
      }

      this.isLoading = true
      try {
        const response = await mapApi.getTelescopes()

        if (response?.telescopes) {
          this.telescopes.clear()
          this.validTelescopeIds.clear()
          this.validTelescopeIds.add('custom')
          this.validTelescopeIds.add('local')

          for (const telescope of response.telescopes) {
            // Use hostname for routing consistency (what appears in URLs)
            const telescopeKey = telescope.hostname || telescope.nodeName
            this.telescopes.set(telescopeKey, {
              ...telescope,
              fallback: false
            })
            this.validTelescopeIds.add(telescopeKey)
          }

          this.lastUpdated = Date.now()
          return true
        }

        return false
      } catch (error) {
        console.error('Failed to fetch telescopes:', error)
        return false
      } finally {
        this.isLoading = false
      }
    },

    /**
     * Check if a telescope ID is valid
     */
    isValidTelescope(telescopeId) {
      return this.validTelescopeIds.has(telescopeId)
    },

    /**
     * Start automatic polling
     */
    startPolling(interval = 30_000) {
      this.stopPolling()

      // Don't poll in local mode
      if (this.localMode) {
        return
      }

      // Only do initial fetch if data is stale (avoid duplicate API calls)
      if (this.isDataStale()) {
        this.fetchTelescopes()
      }

      // Set up polling
      this.pollInterval = setInterval(() => {
        this.fetchTelescopes()
      }, interval)
    },

    /**
     * Stop automatic polling
     */
    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },

    /**
     * Force refresh telescope data
     */
    async refresh() {
      return await this.fetchTelescopes()
    },

    /**
     * Set local mode
     */
    setLocalMode(enabled) {
      this.localMode = enabled
      if (enabled) {
        this.stopPolling()
      }
    }
  }
})
