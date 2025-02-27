import React, { useEffect, useState } from 'react'; // Import React and hooks for state and side effects

// MainPage Component - Displays the leaderboard and game entry point
// Props:
// - identityInfo: Contains user authentication details (if logged in)
const MainPage = ({ identityInfo }) => {
    
    const headers = ["Rank", "Username", "ELO"]; // Column headers for the leaderboard table
    
    const [tableData, setTableData] = useState([]); // State to store leaderboard data

    // useEffect Hook - Fetches the leaderboard data from the backend when the component mounts
    useEffect(() => {
        const getLeaderboard = async () => {
            try {
                // Fetch leaderboard data from the backend API
                const response = await fetch(`/api/v1/leaderboard`, {
                    method: "GET"
                });

                // Parse response as JSON
                let result = await response.json();

                // Map API response to include a "rank" field (1-based index)
                result = result.map((user, i) => ({
                    rank: i + 1, // Assign rank based on position in the array
                    username: user.username, // Store username
                    elo: user.elo // Store ELO score
                }));

                // Update state with the formatted leaderboard data
                setTableData(result);
            } catch (e) {
                console.error(`Error fetching leaderboard: ${e}`); // Log error if the request fails
            }
        };

        getLeaderboard(); // Call function to fetch leaderboard data

    }, []); // Empty dependency array ensures this runs only once (on mount)

    return (
        <div className="container">
            {/* Check if user is logged in */}
            {identityInfo ? (
                <div className="row">
                    <h1 style={{ color: "white" }}>LEADERBOARD</h1> {/* Leaderboard title */}

                    <div className="col-md-6">
                        {/* Leaderboard Table */}
                        <table className="table table-striped table-bordered table-dark">
                            <thead className="table-dark">
                                <tr>
                                    {headers.map((header, index) => (
                                        <th key={index}>{header}</th> // Render table headers dynamically
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {Object.values(row).map((value, colIndex) => (
                                            <td key={colIndex}>{value}</td> // Render leaderboard rows dynamically
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Play Button Section */}
                    <div className="col-md-6">
                        <a href="/#/gamePage" className="btn btn-primary" role="button">
                            Play
                        </a>
                    </div>
                </div>
            ) : (
                // If user is not logged in, show login button
                <a href="/signin" className="btn btn-primary" role="button">
                    Log in
                </a>
            )}
        </div>
    );
}

export default MainPage; // Export the MainPage component for use in the app
