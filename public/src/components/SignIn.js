import React, { useState, useEffect } from 'react'; // Import React and necessary hooks for state management
import { useNavigate } from 'react-router-dom'; // Import useNavigate for programmatic navigation
import { escapeHTML, fetchJSON } from '../javascripts/utils'; // Import utility functions for escaping HTML and API requests

/**
 * SignIn Component
 * - Handles user authentication and profile loading.
 * - Fetches user identity from the backend API.
 * - If logged in, it stores user data and redirects to the home page.
 * - If not logged in, it provides a login button.
 * 
 * Props:
 * @param {Object} identityInfo - Contains the logged-in user's details.
 * @param {Function} setIdentityInfo - Function to update user identity state.
 * @param {String} error - Error message state for displaying login issues.
 * @param {Function} setError - Function to update the error state.
 */
const SignIn = ({ identityInfo, setIdentityInfo, error, setError }) => {
    const navigate = useNavigate(); // Hook to navigate between pages

    /**
     * Function to display an error message for 4 seconds before clearing it.
     * @param {String} message - Error message to be displayed.
     */
    const displayError = async (message) => {
        setError(message); // Set error state
        await new Promise((resolve) => setTimeout(resolve, 4000)); // Wait for 4 seconds
        setError(null); // Clear error message
    };

    /**
     * Function to add a new user to the database.
     * - Checks if the user exists before adding.
     * - Sends a request to `/api/v1/users/add` to store the user.
     * @param {String} username - The username to be added to the database.
     */
    const addUserToDatabase = async (username) => {
        try {
            // Send a POST request to add the user
            const response = await fetch(`/api/v1/users/add`, {
                method: 'POST',
                body: JSON.stringify({ username }),
                headers: { 'Content-Type': 'application/json' },
            });

            // Parse response JSON
            const result = await response.json();

            if (result.status === 'success') {
                console.log("User added to database successfully");
            } else {
                console.log("User exists or encountered an error");
            }
        } catch {
            console.error("Error adding user to database");
            await displayError("Could not add user to database"); // Show error message
        }
    };

    /**
     * Function to load user identity from the backend.
     * - Fetches user identity data from `/api/v1/users/myIdentity`.
     * - If logged in, stores user details and redirects to home.
     * - If not logged in, clears identity state.
     */
    const loadIdentity = async () => {
        try {
            // Fetch user identity from API
            const identityInfo = await fetchJSON(`/api/v1/users/myIdentity`);

            if (identityInfo.status === "loggedin") {
                // Update user identity state
                setIdentityInfo({
                    username: identityInfo.userInfo.username,
                    name: identityInfo.userInfo.name,
                    elo: identityInfo.userInfo.elo
                });

                setError(null); // Clear any existing errors

                // Add user to the database (ensuring persistence)
                await addUserToDatabase(identityInfo.userInfo.username);

                // Navigate to home page after successful login
                navigate('/home');
            } else {
                setIdentityInfo(null); // Clear user state if not logged in
            }
        } catch (err) {
            console.log(err); // Log error if request fails
            setError("Error loading identity. Please try again."); // Set error message
            setIdentityInfo(null); // Clear identity state on failure
        }
    };

    /**
     * useEffect Hook - Runs once on component mount.
     * - Calls `loadIdentity()` to check user authentication.
     */
    useEffect(() => {
        loadIdentity();
    }, []); // Empty dependency array ensures it runs only once

    return (
        <div id="identity_div" className='login'>
            {/* If there's an error, display a retry button and error message */}
            {error ? (
                <div>
                    <button onClick={loadIdentity}>Retry</button>
                    <span>{error}</span>
                </div>
            ) : identityInfo ? (
                // If user is logged in, display their name and username
                <div>
                    <p>
                        {escapeHTML(identityInfo.name)} ({escapeHTML(identityInfo.username)})
                    </p>
                </div>
            ) : (
                // If user is not logged in, display the "Log in" button
                <a href="/signin" className="btn btn-primary" role="button">
                    Log in
                </a>
            )}
        </div>
    );
};

export default SignIn; // Export SignIn component
