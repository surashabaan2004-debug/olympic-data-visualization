// Start values
let currentYear = "all";
let selectedCountry = "Germany";

let geoData = null;
let medalData = null;

// Gold color scale
const colorScale = d3.scaleSequential(d3.interpolateYlOrBr);

// Setup map size
const width = 800;
const height = 600;
const svg = d3.select("#map").append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);

// Focus on Europe
const projection = d3.geoMercator()
    .center([15, 52])
    .scale(width * 0.7)
    .translate([width / 2, height / 2]);

const pathGenerator = d3.geoPath().projection(projection);

// Fix country names
const nameMapping = {
    "Great Britain": "United Kingdom",
    "Czech Republic": "Czechia",
    "Russia": "Russian Federation",
    "North Macedonia": "Macedonia"
};

// Load files
Promise.all([
    d3.json("europe.geojson"),
    d3.csv("medals.csv", function (d) {

        let countryName = nameMapping[d.Country] || d.Country;

        return {
            Country: countryName,
            OriginalName: d.Country,
            Year: d.Year,
            Gold: +d.Gold,
            Silver: +d.Silver,
            Bronze: +d.Bronze,
            Total: +d.Total
        };
    })
]).then(function (files) {
    geoData = files[0];
    medalData = files[1];

    initApp(); // Start app
}).catch(function (error) {
    console.error("Error: ", error);
});

// --- Main Functions ---

function initApp() {
    // Dropdown change
    d3.select("#yearSelect").on("change", function (event) {
        currentYear = event.target.value;
        updateDashboard();
    });

    updateDashboard(); // First load
}

function updateDashboard() {
    const aggregatedData = getAggregatedData(currentYear);

    // Find max gold
    let maxGold = 0;
    aggregatedData.forEach(function (dataPoint) {
        if (dataPoint.Gold > maxGold) {
            maxGold = dataPoint.Gold;
        }
    });

    // Set max color
    colorScale.domain([0, maxGold === 0 ? 1 : maxGold]);

    // Update screen
    drawMap(aggregatedData);
    updateTop3Text(aggregatedData);
    updateSelectedCountryText(aggregatedData);
    drawLegend(maxGold);
}

// Calculate totals
function getAggregatedData(yearSelection) {
    const dataMap = new Map();

    for (let i = 0; i < medalData.length; i++) {
        let row = medalData[i];

        // Filter year
        if (yearSelection !== "all" && row.Year !== yearSelection) {
            continue;
        }

        // Add country if new
        if (!dataMap.has(row.Country)) {
            dataMap.set(row.Country, {
                Country: row.Country,
                OriginalName: row.OriginalName,
                Gold: 0, Silver: 0, Bronze: 0, Total: 0
            });
        }

        // Add medals
        let countryTotal = dataMap.get(row.Country);
        countryTotal.Gold += row.Gold;
        countryTotal.Silver += row.Silver;
        countryTotal.Bronze += row.Bronze;
        countryTotal.Total += row.Total;
    }

    return dataMap;
}

// Get map name
function getGeoName(feature) {
    return feature.properties.name || feature.properties.NAME || feature.properties.admin || feature.properties.sovereignt || "Unknown";
}

// --- Drawing Functions ---

// Draw map
function drawMap(dataMap) {
    const tooltip = d3.select("#tooltip");
    const mapPaths = svg.selectAll("path").data(geoData.features);

    mapPaths.join("path")
        .attr("d", pathGenerator)
        .attr("stroke", "#333") // Borders
        .attr("stroke-width", 0.5)
        .attr("fill", function (d) {
            const geoName = getGeoName(d);
            const data = dataMap.get(geoName);

            // Gray if no medals
            if (!data || data.Total === 0) {
                return "#e0e0e0";
            }

            // Color by gold
            return colorScale(data.Gold);
        })
        .on("mouseover", function (event, d) {
            const geoName = getGeoName(d);
            const data = dataMap.get(geoName);

            d3.select(this).attr("stroke-width", 2); // Hover effect

            // Show tooltip if medals > 0
            if (data && data.Total > 0) {
                tooltip.classed("hidden", false)
                    .html(`<strong>${data.OriginalName}</strong><br>Total Medals: ${data.Total}`);
            }
        })
        .on("mousemove", function (event) {
            // Move tooltip
            tooltip.style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 25) + "px");
        })
        .on("mouseout", function () {
            // Hide tooltip
            d3.select(this).attr("stroke-width", 0.5);
            tooltip.classed("hidden", true);
        })
        .on("click", function (event, d) {
            // Select country
            const geoName = getGeoName(d);
            const data = dataMap.get(geoName);
            selectedCountry = data ? data.Country : geoName;
            updateSelectedCountryText(dataMap);
        });
}

// Show Top 3
function updateTop3Text(dataMap) {
    const countriesArray = Array.from(dataMap.values());

    // Sort by Gold, Silver, Bronze
    countriesArray.sort(function (a, b) {
        if (b.Gold !== a.Gold) return b.Gold - a.Gold;
        if (b.Silver !== a.Silver) return b.Silver - a.Silver;
        return b.Bronze - a.Bronze;
    });

    // Get Top 3
    const top3 = countriesArray.slice(0, 3);
    let htmlContent = "";

    for (let i = 0; i < top3.length; i++) {
        let country = top3[i];
        htmlContent += `<p><strong>${i + 1}. ${country.OriginalName}</strong><br>
                        Total: ${country.Total} (Gold: ${country.Gold}, Silver: ${country.Silver}, Bronze: ${country.Bronze})</p>`;
    }

    d3.select("#top3-content").html(htmlContent);
}

// Show selected country
function updateSelectedCountryText(dataMap) {
    const data = dataMap.get(selectedCountry);
    const displayName = data ? data.OriginalName : selectedCountry;
    let htmlContent = `<h3>${displayName}</h3>`;

    if (data && data.Total > 0) {
        htmlContent += `<p>Total Medals: <strong>${data.Total}</strong><br>
                        Gold: ${data.Gold} | Silver: ${data.Silver} | Bronze: ${data.Bronze}</p>`;
    } else {
        htmlContent += `<p>No medals won in this time period.</p>`;
    }

    d3.select("#country-content").html(htmlContent);
}

// Draw legend
function drawLegend(maxGold) {
    const legendContainer = d3.select("#legend");
    let htmlContent = `<strong>Legend (Gold Medals)</strong>
                       <div style="display:flex; justify-content:center; gap:10px; margin-top:10px;">`;

    // 5 steps
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
        const value = Math.round((maxGold / steps) * i);
        const color = colorScale(value);

        htmlContent += `<div style="text-align:center;">
                            <div style="width:30px; height:20px; background-color:${color}; border:1px solid #333;"></div>
                            <span style="font-size:12px;">${value}</span>
                        </div>`;
    }

    htmlContent += `</div>`;
    legendContainer.html(htmlContent);
}