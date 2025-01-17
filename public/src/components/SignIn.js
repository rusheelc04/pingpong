import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { escapeHTML, fetchJSON } from '../javascripts/utils';

const SignIn = ({identityInfo, setIdentityInfo, error, setError}) => {
    const navigate = useNavigate()

    const displayError = async (message) => {
        setError(message);
        await new Promise((resolve) => setTimeout(resolve, 4000));
        setError(null);
    };

    const addUserToDatabase = async (username) => {
        try {
            const response = await fetch(`/api/v1/users/add`, {
                method: 'POST',
                body: JSON.stringify({ username }),
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json();

            if (result.status === 'success') {
                console.log("User added to database successfully");
            } else {
                console.log("User exists or encountered an error");
            }
        } catch {
            console.error("Error adding user to database");
            await displayError("Could not add user to database");
        }
    };

    const loadIdentity = async () => {
        try {
            const identityInfo = await fetchJSON(`/api/v1/users/myIdentity`);

            if (identityInfo.status === "loggedin") {
                setIdentityInfo({
                    username: identityInfo.userInfo.username,
                    name: identityInfo.userInfo.name,
                    elo: identityInfo.userInfo.elo
                });
                setError(null);

                await addUserToDatabase(identityInfo.userInfo.username);
                navigate('/home')
            } else {
                setIdentityInfo(null);
            }
        } catch (err) {
            console.log(err);
            setError("Error loading identity. Please try again.");
            setIdentityInfo(null);
        }
    };

    useEffect(() => {
        loadIdentity();
    }, []);
    
    return (
        <div id="identity_div" className='login'>
            {error ? (
                <div>
                    <button onClick={loadIdentity}>Retry</button>
                    <span>{error}</span>
                </div>
            ) : identityInfo ? (
                <div>
                    <p>
                        {escapeHTML(identityInfo.name)} ({escapeHTML(identityInfo.username)})
                    </p>
                    
                </div>
            ) : (
                <a href="/signin" className="btn btn-primary" role="button">
                    Log in
                </a>
            )}
        </div>
    );
};

export default SignIn;