/**
 * fetchJSON - Fetches JSON data from a given API endpoint with optional configurations.
 * - Handles network errors, response parsing, and error reporting.
 * - Ensures that only valid JSON responses are returned.
 * 
 * @param {string} route - The API endpoint URL.
 * @param {Object} [options] - Optional settings such as method, headers, and body.
 * @returns {Promise<Object>} - The parsed JSON response from the server.
 * @throws {Error} - Throws an error if the request fails, the response is not JSON, or JSON parsing fails.
 */
async function fetchJSON(route, options) {
    let response;

    try {
        // Perform the fetch request with method and body if provided
        response = await fetch(route, {
            method: options?.method || "GET", // Default method is GET
            body: options?.body ? JSON.stringify(options.body) : undefined, // Stringify body if present
            headers: options?.body ? { 'Content-Type': 'application/json' } : undefined, // Set Content-Type only if body exists
        });
    } catch (error) {
        // Handle network errors (server unreachable, connection failure, etc.)
        throw new Error(
            `Error fetching ${route} with options: ${JSON.stringify(options || {})}
             No response from server (failed to fetch)`
        );
    }

    let responseText;
    try {
        // Read the response as plain text first to handle errors properly
        responseText = await response.text();
    } catch (error) {
        throw new Error(
            `Error reading response from ${route} with options: ${JSON.stringify(options || {})}
             Status: ${response.status}`
        );
    }

    // Extract the Content-Type header to determine if the response is JSON
    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
        try {
            return JSON.parse(responseText); // Parse JSON response
        } catch (error) {
            // Handle JSON parsing errors and include the raw response for debugging
            throw new Error(
                `Error parsing JSON from ${route} with options: ${JSON.stringify(options || {})}
                 Status: ${response.status}
                 Response: ${responseText}`
            );
        }
    }

    // If response is not JSON, throw an error with details
    throw new Error(
        `Unexpected response type from ${route} with options: ${JSON.stringify(options || {})}
         Status: ${response.status}
         Response: ${responseText}`
    );
}

/**
 * escapeHTML - Escapes special characters in a string to prevent XSS (Cross-Site Scripting) attacks.
 * - Converts &, <, >, ', and " to their respective HTML entities.
 * 
 * @param {string} str - The input string to escape.
 * @returns {string} - The sanitized string with escaped characters.
 */
function escapeHTML(str) {
    return !str
        ? str // Return original value if falsy (null, undefined, empty string)
        : str.replace(/[&<>'"]/g, (tag) => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              "'": '&#39;',
              '"': '&quot;'
          }[tag]));
}

// Export the functions for use in other parts of the application
export { escapeHTML, fetchJSON };
