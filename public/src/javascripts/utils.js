async function fetchJSON(route, options) {
    let response;
    try {
        response = await fetch(route, {
            method: options?.method || "GET",
            body: options?.body ? JSON.stringify(options.body) : undefined,
            headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
        });
    } catch (error) {
        throw new Error(
            `Error fetching ${route} with options: ${JSON.stringify(options || {})}
             No response from server (failed to fetch)`
        );
    }

    let responseText;
    try {
        responseText = await response.text(); // Read response as text first
    } catch (error) {
        throw new Error(
            `Error reading response from ${route} with options: ${JSON.stringify(options || {})}
             Status: ${response.status}`
        );
    }

    // Try parsing JSON if Content-Type indicates JSON
    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
        try {
            return JSON.parse(responseText);
        } catch (error) {
            throw new Error(
                `Error parsing JSON from ${route} with options: ${JSON.stringify(options || {})}
                 Status: ${response.status}
                 Response: ${responseText}`
            );
        }
    }

    // If not JSON, throw an error
    throw new Error(
        `Unexpected response type from ${route} with options: ${JSON.stringify(options || {})}
         Status: ${response.status}
         Response: ${responseText}`
    );
}


function escapeHTML(str) {
    return !str
        ? str
        : str.replace(/[&<>'"]/g, (tag) => ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              "'": '&#39;',
              '"': '&quot;'
          }[tag]));
}

export { escapeHTML, fetchJSON, }