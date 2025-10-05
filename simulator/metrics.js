/**
 * metrics.js
 *
 * This file contains utility functions to calculate metrics
 * for the Game of Life simulator.
 */

var MetricsWarehouse = {

  // ---------------
  // Private Members

  // Each metric is now an array to store its value over time.
  _c1_history: [], // color1 counts
  _c2_history: [], // color2 counts
  _cE_history: [], // empty counts

  _density1_history: [],
  _density2_history: [],
  _densityE_history: [],

  _entropy_binary_history: [],

  _fft_power_spectrum_history: [], // Stores the 1D radially averaged power spectrum

  // ----------------------------------
  // Public Method for Doing Everything

  /**
   * Main entry point for all metric calculations. This function is called
   * at the end of each generation from the main simulator.
   *
   * @param {Array} state1 - The data structure for Color 1 live cells.
   * @param {Array} state2 - The data structure for Color 2 live cells.
   * @param {number} columns - The total number of columns in the grid.
   * @param {number} rows - The total number of rows in the grid.
   */
  updateMetrics: function(state1, state2, columns, rows, generation) {

    // 1. Calculate the metrics for the current generation.
    const counts = this.calculateCellCounts(state1, state2, columns, rows);
    const densities = this.calculateDensity(columns, rows, counts);
    const entropies = this.calculateEntropy(densities);
    const fft_spectrum = this.calculateFFT(state1, state2, columns, rows);

    // 2. Store the new values in our history arrays.
    // The generation number is used as the index.
    this._c1_history[generation] = counts.c1;
    this._c2_history[generation] = counts.c2;
    this._cE_history[generation] = counts.cE;

    this._density1_history[generation] = densities.rho1;
    this._density2_history[generation] = densities.rho2;
    this._densityE_history[generation] = densities.rhoE;

    this._entropy_binary_history[generation] = entropies.h_binary;

    this._fft_power_spectrum_history[generation] = fft_spectrum;

    // 3. Log the results for the current step to the console for verification.
    console.log(`--- Metrics for Generation: ${generation} ---`);
    console.log(`Color 1 Cells: ${this._c1_history[generation]} | Density: ${this._density1_history[generation].toFixed(3)}`);
    console.log(`Color 2 Cells: ${this._c2_history[generation]} | Density: ${this._density2_history[generation].toFixed(3)}`);
    console.log(`Empty Cells:   ${this._cE_history[generation]} | Density: ${this._densityE_history[generation].toFixed(3)}`);
    console.log(`Entropy (Binary): ${entropies.h_binary.toFixed(3)}`);
    console.log(`FFT Spectrum (P(r)): [${fft_spectrum.slice(0, 5).map(v => v.toFixed(1)).join(', ')}, ...]`);
    console.log("---------------------------------");
  },

  // -------------------------------
  // Public Methods for Calculations

  /**
   * Calculates the population counts for each state for a single timestep.
   * Pure calculator, does not store state.
   *
   * @returns {object} An object containing the counts {c1, c2, cE}.
   */
  calculateCellCounts: function(state1, state2, columns, rows) {
    let i;
    let c1_temp = 0;
    let c2_temp = 0;

    // Calculate count for Color 1
    for (i = 0; i < state1.length; i++) {
      c1_temp += state1[i].length - 1;
    }

    // Calculate count for Color 2
    for (i = 0; i < state2.length; i++) {
      c2_temp += state2[i].length - 1;
    }

    const totalCells = columns * rows;
    const cE_temp = totalCells - (c1_temp + c2_temp);

    return { c1: c1_temp, c2: c2_temp, cE: cE_temp };
  },


  /**
   * Calculates the density of each state using the provided counts.
   * @param {number} columns - The total number of columns in the grid.
   * @param {number} rows - The total number of rows in the grid.
   * @param {object} counts - An object containing the cell counts {c1, c2, cE}.
   * @returns {object} An object containing the densities {rho1, rho2, rhoE}.
   */
  calculateDensity: function(columns, rows, counts) {
    const totalCells = columns * rows;
    if (totalCells === 0) {
      return { rho1: 0, rho2: 0, rhoE: 0 };
    }

    const rho1 = counts.c1 / totalCells;
    const rho2 = counts.c2 / totalCells;
    const rhoE = counts.cE / totalCells;

    return { rho1: rho1, rho2: rho2, rhoE: rhoE };
  },


  /**
   * Calculates Shannon entropy using the provided densities.
   * @param {object} densities - An object containing the densities {rho1, rho2, rhoE}.
   * @returns {object} An object containing the binary and ternary entropies.
   */
  calculateEntropy: function(densities) {
    // Helper function for the entropy calculation: H = -p * log2(p)
    // Returns 0 if p is 0, as is the convention.
    const h_func = (p) => {
      return (p === 0) ? 0 : -p * Math.log2(p);
    };

    // Binary Entropy (non-empty vs. empty)
    const rho_non_empty = densities.rho1 + densities.rho2;
    const h_binary = h_func(rho_non_empty) + h_func(densities.rhoE);

    return { h_binary: h_binary};
  },


  /**
   * Main FFT calculation workflow.
   * @returns {Array} The 1D radially averaged power spectrum.
   */
  calculateFFT: function(state1, state2, columns, rows) {
    // Step 1: Create a dense 2D matrix of the grid state (0=empty, 1=non-empty).
    const gridMatrix = this._createGridMatrix(state1, state2, columns, rows);

    // Step 2: Perform the 2D FFT and get the 2D power spectrum.
    const powerSpectrum2D = this._getPowerSpectrum2D(gridMatrix, columns, rows);

    // Step 3: Radially average the 2D spectrum to get a 1D spectrum.
    const powerSpectrum1D = this._radiallyAverage(powerSpectrum2D, columns, rows);

    return powerSpectrum1D;
  },


  // ------------------------------------
  // Private Methods for FFT Calculations

  /**
   * Creates a dense 2D matrix from the sparse list of live cells.
   */
  _createGridMatrix: function(state1, state2, columns, rows) {
    // Initialize an empty matrix filled with zeros.
    let matrix = Array(rows).fill(0).map(() => Array(columns).fill(0));

    // Populate with Color 1 cells.
    for (let i = 0; i < state1.length; i++) {
      const y = state1[i][0];
      for (let j = 1; j < state1[i].length; j++) {
        const x = state1[i][j];
        if (y < rows && x < columns) matrix[y][x] = 1;
      }
    }
    // Populate with Color 2 cells.
    for (let i = 0; i < state2.length; i++) {
      const y = state2[i][0];
      for (let j = 1; j < state2[i].length; j++) {
        const x = state2[i][j];
        if (y < rows && x < columns) matrix[y][x] = 1;
      }
    }
    return matrix;
  },

  /**
   * Performs the 2D FFT and calculates the power spectrum.
   */
  _getPowerSpectrum2D: function(gridMatrix, columns, rows) {

    let real = [];
    let imag = [];

    // 1. FFT each row
    for (let y = 0; y < rows; y++) {
      let rowReal = gridMatrix[y].slice();
      let rowImag = new Array(columns).fill(0);
      transform(rowReal, rowImag); // Global function from fft.js
      real.push(...rowReal);
      imag.push(...rowImag);
    }

    // 2. FFT each column
    for (let x = 0; x < columns; x++) {
      let colReal = new Array(rows);
      let colImag = new Array(rows);
      for (let y = 0; y < rows; y++) {
        colReal[y] = real[y * columns + x];
        colImag[y] = imag[y * columns + x];
      }
      transform(colReal, colImag);
      for (let y = 0; y < rows; y++) {
        real[y * columns + x] = colReal[y];
        imag[y * columns + x] = colImag[y];
      }
    }

    // 3. Calculate power and perform "fftshift"
    let powerSpectrum = Array(rows).fill(0).map(() => Array(columns).fill(0));
    const halfCols = Math.floor(columns / 2);
    const halfRows = Math.floor(rows / 2);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const index = y * columns + x;
        const r = real[index];
        const i = imag[index];
        const power = r * r + i * i;
        const shiftedX = (x + halfCols) % columns;
        const shiftedY = (y + halfRows) % rows;
        powerSpectrum[shiftedY][shiftedX] = power;
      }
    }
    return powerSpectrum;
  },

  /**
   * Averages the 2D power spectrum into a 1D array based on radial distance.
   */
  _radiallyAverage: function(powerSpectrum2D, columns, rows) {
    const centerX = Math.floor(columns / 2);
    const centerY = Math.floor(rows / 2);
    const maxRadius = Math.floor(Math.sqrt(centerX * centerX + centerY * centerY));

    // Bins to hold the sum of power and the count for each radial distance.
    let powerBins = new Float64Array(maxRadius + 1).fill(0);
    let countBins = new Uint32Array(maxRadius + 1).fill(0);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const radius = Math.floor(Math.sqrt(dx * dx + dy * dy));

        if (radius <= maxRadius) {
          powerBins[radius] += powerSpectrum2D[y][x];
          countBins[radius]++;
        }
      }
    }

    // Calculate the average for each bin.
    let radialAverage = [];
    for (let i = 0; i <= maxRadius; i++) {
      radialAverage[i] = (countBins[i] > 0) ? powerBins[i] / countBins[i] : 0;
    }
    return radialAverage;
  }

};