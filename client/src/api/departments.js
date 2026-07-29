import axios from "axios";
import { getToken } from "./auth";
import { getApiRoot } from "../config/organizations";

export const getDepartments = async () => {
    const token = getToken();
    const response = await axios.get(`${getApiRoot()}/departments?sort=name`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.data;
};
