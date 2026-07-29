import axios from "axios";
import { getToken } from "./auth";
import { getApiRoot } from "../config/organizations";

// Get subdivisions, optionally filtered by department ID
export const getSubdivisions = async (departmentId = null) => {
    const token = getToken();
    const filter = departmentId
        ? `&filters[department][id][$eq]=${departmentId}`
        : "";
    const response = await axios.get(
        `${getApiRoot()}/subdivisions?sort=name${filter}&populate=department&pagination[pageSize]=100`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.data;
};
