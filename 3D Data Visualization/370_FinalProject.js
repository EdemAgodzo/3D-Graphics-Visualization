console.log("370_FinalProject.js loaded and running");

window.onload = function() {
  // Get the canvas and initialize the WebGL2 context.
  const canvas = document.getElementById("glcanvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("experimental-webgl2");
  if (!gl) {
    alert("WebGL2 not supported in this browser.");
    return;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND); //so no fragment blending


  // ------------------ Shader Setup ------------------
  const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    varying vec3 vNormal;
    void main(void) {
      gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
      vNormal = aNormal;
    }
  `;
  const fsSource = `
    precision mediump float;
uniform vec3 uBarColor;
varying vec3 vNormal;

void main(void) {
  vec3 lightDir = normalize(vec3(0.0, 1.0, 1.0));
  float ambient = 0.2;
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
  float brightness = ambient + (1.0 - ambient) * diffuse;
  
  // Toon shading quantization:
  if (brightness > 0.85) {
    brightness = 1.0;
  } else if (brightness > 0.65) {
    brightness = 0.8;
  } else if (brightness > 0.45) {
    brightness = 0.6;
  } else if (brightness > 0.25) {
    brightness = 0.4;
  } else {
    brightness = 0.2;
  }
  
  gl_FragColor = vec4(uBarColor * brightness, 1.0);
}

  `;
  
  function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Error compiling shader:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  
  const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error("Unable to initialize the shader program:", gl.getProgramInfoLog(shaderProgram));
    return;
  }
  gl.useProgram(shaderProgram);
  
  // Get attribute and uniform locations.
  const aPositionLoc = gl.getAttribLocation(shaderProgram, "aPosition");
  const aNormalLoc = gl.getAttribLocation(shaderProgram, "aNormal");
  const uModelLoc = gl.getUniformLocation(shaderProgram, "uModel");
  const uViewLoc = gl.getUniformLocation(shaderProgram, "uView");
  const uProjectionLoc = gl.getUniformLocation(shaderProgram, "uProjection");
  const uBarColorLoc = gl.getUniformLocation(shaderProgram, "uBarColor");

  // ------------------ Camera Setup ------------------
  // Adjusted camera position to better view a grid of bars.
  const viewMatrix = lookAt([70, 20, 30], [0, 0, 0], [0, 1, 0]);
  const projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 500);
  gl.uniformMatrix4fv(uViewLoc, false, flatten(viewMatrix));
  gl.uniformMatrix4fv(uProjectionLoc, false, flatten(projectionMatrix));

  // ------------------ Load the OBJ Bar Model ------------------
  loadObj("models/bar.obj").then(entity => {
    console.log("OBJ Entity:", entity);
    console.log("Vertices count:", entity.vertices.length);
    console.log("Indices count:", entity.indices.length);

    // Create buffers for vertices, normals, and indices.
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(entity.vertices), gl.STATIC_DRAW);
    
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(entity.orderedNormals), gl.STATIC_DRAW);
    
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(entity.indices), gl.STATIC_DRAW);
    
    // Bind static vertex attributes.
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPositionLoc);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(aNormalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aNormalLoc);
    
    // Disable face culling to avoid issues with winding order.
    gl.disable(gl.CULL_FACE);
    
    // ------------------ CSV Data Loading ------------------
    // stockData will be a flat array where each element represents a bar
    // for a given company at a specific month.
    let stockData = [];
    const barSpacing = 5.0;   // spacing along x-axis for companies
    const timeSpacing = 3.0;  // spacing along z-axis for months
    let angle = 0;
    let isRotating = false;
    
    // Define an array of colors (one per company).
    const barColors = [
      [1.0, 0.0, 0.0], // red
      [0.0, 1.0, 0.0], // green
      [0.0, 0.0, 1.0], // blue
      [1.0, 1.0, 0.0]  // yellow
    ];
    
    // Function to load and parse CSV using native JavaScript.
    function loadCSV(url) {
      return fetch(url)
        .then(response => response.text())
        .then(csvText => {
          const rows = csvText.trim().split("\n");
          const headers = rows.shift().split(",").map(h => h.trim());
          const data = rows.map(row => {
            const cols = row.split(",").map(col => col.trim());
            let record = {};
            headers.forEach((header, i) => {
              record[header] = cols[i];
            });
            return record;
          });
          return { headers, data };
        });
    }
    
    // Load CSV data (adjust the file path as necessary).
    loadCSV("stocks.csv").then(csvResult => {
      const headers = csvResult.headers;  // e.g., ["Month", "AAPL", "GOOG", "MSFT", "AMZN"]
      const dataRows = csvResult.data;
      // Assume the first header is "Month"; the rest are company symbols.
      const companies = headers.slice(1);
      
      // Build a flat array where each object represents a bar.
      // Each bar is positioned according to its company (x-axis) and month (z-axis).
      stockData = [];
      dataRows.forEach((record, monthIndex) => {
        companies.forEach((company, companyIndex) => {
          stockData.push({
            month: record["Month"],
            symbol: company,
            price: parseFloat(record[company]),
            monthIndex: monthIndex,
            companyIndex: companyIndex
          });
        });
      });
      
      updateLegend();
    }).catch(error => {
      console.error("Error loading CSV:", error);
    });
    
    // ------------------ Create the Legend ------------------
    function updateLegend() {
      const legendContainer = document.getElementById("legend");
      legendContainer.innerHTML = ""; // Clear existing labels.
      // Group data by company so each company appears once.
      const companyData = {};
      stockData.forEach(data => {
        if (!companyData[data.symbol]) {
          companyData[data.symbol] = [];
        }
        companyData[data.symbol].push(data.price);
      });
      
      let index = 0;
      for (let symbol in companyData) {
        const prices = companyData[symbol];
        // Compute average price for display.
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const item = document.createElement("div");
        item.className = "legend-item";
        
        const colorBox = document.createElement("div");
        colorBox.className = "legend-color";
        const color = barColors[index % barColors.length];
        const r = Math.round(color[0] * 255);
        const g = Math.round(color[1] * 255);
        const b = Math.round(color[2] * 255);
        colorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        
        const labelText = document.createElement("span");
        labelText.innerText = `${symbol} (avg: $${avgPrice.toFixed(2)})`;
        
        item.appendChild(colorBox);
        item.appendChild(labelText);
        legendContainer.appendChild(item);
        index++;
      }
    }
    
    // ------------------ UI Event Listeners ------------------
    document.getElementById("updateButton").addEventListener("click", () => {
      // Simulate an update: randomly adjust prices by ±10%.
      stockData = stockData.map(data => {
        const delta = data.price * (Math.random() * 0.2 - 0.1);
        return { ...data, price: Math.max(10, data.price + delta) };
      });
      console.log("Updated stock data:", stockData);
      updateLegend();
    });
    
    document.getElementById("toggleRotation").addEventListener("click", () => {
      isRotating = !isRotating;
      console.log("Rotation toggled. Now rotating:", isRotating);
    });
    
    // ------------------ Render Loop ------------------
    function renderBarGraph() {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      updateViewMatrix();
      
      // Wait until CSV data is loaded.
      if (stockData.length === 0) {
        requestAnimationFrame(renderBarGraph);
        return;
      }
      
      // Determine the maximum price across all data for scaling.
      const basePrice = Math.max(...stockData.map(data => data.price));
      
      // Render each bar.
      stockData.forEach((data, index) => {
        let barMatrix = mat4(); // Start with the identity matrix.
        // Position: x based on companyIndex, z based on monthIndex.
        barMatrix = mult(barMatrix, translate(data.companyIndex * barSpacing, 0, data.monthIndex * timeSpacing));
        
        // Apply rotation if enabled.
        if (isRotating) {
          barMatrix = mult(barMatrix, rotateY(angle));
        }
        
        // Scale vertically based on the stock price.
        const scaleY = data.price / basePrice;
        barMatrix = mult(barMatrix, scalem(1, scaleY, 1));
        
        // Translate upward so the bar's base is at y = 0.
        barMatrix = mult(translate(0, scaleY / 2, 0), barMatrix);
        
        // Set the model matrix uniform.
        gl.uniformMatrix4fv(uModelLoc, false, flatten(barMatrix));
        
        // Set the bar color based on the company (using companyIndex).
        const color = barColors[data.companyIndex % barColors.length];
        gl.uniform3fv(uBarColorLoc, color);
        
        // Draw the bar.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.drawElements(gl.TRIANGLES, entity.indices.length, gl.UNSIGNED_SHORT, 0);
      });
      
      if (isRotating) {
        angle += 0.5;
      }
      requestAnimationFrame(renderBarGraph);
    }
    
    // Start the render loop.
    renderBarGraph();
    
  }).catch(error => {
    console.error("Error loading the OBJ model:", error);
  });

  // Define initial camera parameters.
let cameraPosition = [0, 20, 30];
let cameraTarget = [0, 0, 0];
const cameraUp = [0, 1, 0];
const cameraSpeed = 1.0;

// Function to update the view matrix based on the camera position.
function updateViewMatrix() {
  const viewMatrix = lookAt(cameraPosition, cameraTarget, cameraUp);
  gl.uniformMatrix4fv(uViewLoc, false, flatten(viewMatrix));
}

// Add keyboard event listeners.
document.addEventListener("keydown", function(event) {
  switch (event.key) {
    case "w": // Move forward (decrease Z)
      cameraPosition[2] -= cameraSpeed;
      cameraTarget[2] -= cameraSpeed;
      break;
    case "s": // Move backward (increase Z)
      cameraPosition[2] += cameraSpeed;
      cameraTarget[2] += cameraSpeed;
      break;
    case "a": // Move left (decrease X)
      cameraPosition[0] -= cameraSpeed;
      cameraTarget[0] -= cameraSpeed;
      break;
    case "d": // Move right (increase X)
      cameraPosition[0] += cameraSpeed;
      cameraTarget[0] += cameraSpeed;
      break;
    case "ArrowUp": // Move up (increase Y)
      cameraPosition[1] += cameraSpeed;
      break;
    case "ArrowDown": // Move down (decrease Y)
      cameraPosition[1] -= cameraSpeed;
      break;
  }
  updateViewMatrix();
});

};

 
    

